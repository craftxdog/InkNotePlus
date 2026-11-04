import { randomUUID } from 'node:crypto';
import type { BrowserWindow, IpcMain } from 'electron';
import {
  WINDOW_CHANNELS,
  closeConfirmationSchema,
  closeReadinessSchema,
} from '../shared/window-lifecycle';
import { failure, success } from '../shared/ipc';
import { isTrustedIpcEvent } from './ipc/note-handlers';

export function installCloseGuard(
  window: BrowserWindow,
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
) {
  let ready = false;
  let allowed = false;
  let pending: string | null = null;
  window.on('close', (event) => {
    if (!ready || allowed) return;
    event.preventDefault();
    if (!pending) {
      pending = randomUUID();
      window.webContents.send(WINDOW_CHANNELS.prepare, { requestId: pending });
    }
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
      allowed = true;
      setImmediate(() => {
        if (!window.isDestroyed()) window.close();
      });
    }
    return success(parsed.data.saved);
  });
  window.once('closed', () => {
    ipc.removeHandler(WINDOW_CHANNELS.readiness);
    ipc.removeHandler(WINDOW_CHANNELS.confirm);
  });
}
