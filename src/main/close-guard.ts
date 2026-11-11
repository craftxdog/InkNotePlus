import { randomUUID } from 'node:crypto';
import type { BrowserWindow, IpcMain } from 'electron';
import {
  WINDOW_CHANNELS,
  closeConfirmationSchema,
  closeReadinessSchema,
} from '../shared/window-lifecycle';
import { failure, success } from '../shared/ipc';
import { isTrustedIpcEvent } from './ipc/note-handlers';
import { emptyPreferencesInputSchema } from '../shared/preferences';

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
  ipc.handle(WINDOW_CHANNELS.readiness, (event, input: unknown) => {
    if (!isTrustedIpcEvent(event, window.webContents))
      return failure('unavailable');
    const parsed = closeReadinessSchema.safeParse(input);
    if (!parsed.success) return failure('invalid_input');
    ready = parsed.data.ready;
    return success(true);
  });
  ipc.handle(WINDOW_CHANNELS.confirm, (event, input: unknown) => {
    if (!isTrustedIpcEvent(event, window.webContents))
      return failure('unavailable');
    const parsed = closeConfirmationSchema.safeParse(input);
    if (!parsed.success || parsed.data.requestId !== pending)
      return failure('invalid_input');
    pending = null;
    if (parsed.data.saved) {
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
    return success(parsed.data.saved);
  });
  ipc.handle(WINDOW_CHANNELS.reload, (event, input: unknown) => {
    if (!isTrustedIpcEvent(event, window.webContents))
      return failure('unavailable');
    if (!emptyPreferencesInputSchema.safeParse(input).success)
      return failure('invalid_input');
    reload();
    return success(true);
  });
  window.once('closed', () => {
    ipc.removeHandler(WINDOW_CHANNELS.readiness);
    ipc.removeHandler(WINDOW_CHANNELS.confirm);
    ipc.removeHandler(WINDOW_CHANNELS.reload);
  });
  return { reload };
}
