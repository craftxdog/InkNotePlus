import { randomUUID } from 'node:crypto';
import type {
  BrowserWindow,
  IpcMain,
  IpcMainInvokeEvent,
  WebContents,
} from 'electron';
import {
  WINDOW_CHANNELS,
  closeConfirmationSchema,
  closeReadinessSchema,
} from '../shared/window-lifecycle';
import { failure, success } from '../shared/ipc';
import { isTrustedIpcEvent } from './ipc/note-handlers';
import { emptyPreferencesInputSchema } from '../shared/preferences';

interface Guard {
  webContents: WebContents;
  readiness(ready: boolean): void;
  confirm(requestId: string, saved: boolean): boolean;
  reload(): void;
}

// The channels are shared, so every window reaches its own guard by sender.
const guards = new Map<WebContents, Guard>();

function installHandlers(ipc: Pick<IpcMain, 'handle' | 'removeHandler'>) {
  const guardFor = (event: IpcMainInvokeEvent) => {
    const guard = guards.get(event.sender);
    return guard && isTrustedIpcEvent(event, guard.webContents) ? guard : null;
  };
  ipc.handle(WINDOW_CHANNELS.readiness, (event, input: unknown) => {
    const guard = guardFor(event);
    if (!guard) return failure('unavailable');
    const parsed = closeReadinessSchema.safeParse(input);
    if (!parsed.success) return failure('invalid_input');
    guard.readiness(parsed.data.ready);
    return success(true);
  });
  ipc.handle(WINDOW_CHANNELS.confirm, (event, input: unknown) => {
    const guard = guardFor(event);
    if (!guard) return failure('unavailable');
    const parsed = closeConfirmationSchema.safeParse(input);
    if (
      !parsed.success ||
      !guard.confirm(parsed.data.requestId, parsed.data.saved)
    )
      return failure('invalid_input');
    return success(parsed.data.saved);
  });
  ipc.handle(WINDOW_CHANNELS.reload, (event, input: unknown) => {
    const guard = guardFor(event);
    if (!guard) return failure('unavailable');
    if (!emptyPreferencesInputSchema.safeParse(input).success)
      return failure('invalid_input');
    guard.reload();
    return success(true);
  });
}

export function installCloseGuard(
  window: BrowserWindow,
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
) {
  let ready = false;
  let allowed = false;
  let pending: string | null = null;
  let pendingAction: 'close' | 'reload' = 'close';
  let ignoreCache = false;
  const prepare = () => {
    if (!pending) {
      pending = randomUUID();
      window.webContents.send(WINDOW_CHANNELS.prepare, { requestId: pending });
    }
  };
  function reload(force = false) {
    if (pending) return;
    pendingAction = 'reload';
    ignoreCache = force;
    if (!ready) {
      if (force) window.webContents.reloadIgnoringCache();
      else window.webContents.reload();
    } else prepare();
  }
  window.on('close', (event) => {
    if (!ready || allowed) return;
    event.preventDefault();
    pendingAction = 'close';
    prepare();
  });
  if (!guards.size) installHandlers(ipc);
  const { webContents } = window;
  guards.set(webContents, {
    webContents,
    readiness(value) {
      ready = value;
    },
    confirm(requestId, saved) {
      if (requestId !== pending) return false;
      pending = null;
      if (saved) {
        const action = pendingAction;
        allowed = action === 'close';
        if (action === 'reload') ready = false;
        setImmediate(() => {
          if (window.isDestroyed()) return;
          if (action === 'close') window.close();
          else if (ignoreCache) window.webContents.reloadIgnoringCache();
          else window.webContents.reload();
        });
      }
      return true;
    },
    reload,
  });
  window.once('closed', () => {
    guards.delete(webContents);
    if (guards.size) return;
    ipc.removeHandler(WINDOW_CHANNELS.readiness);
    ipc.removeHandler(WINDOW_CHANNELS.confirm);
    ipc.removeHandler(WINDOW_CHANNELS.reload);
  });
  return { reload };
}
