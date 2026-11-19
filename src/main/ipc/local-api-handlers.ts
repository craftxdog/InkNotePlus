import type { IpcMain, WebContents } from 'electron';
import { failure, success } from '../../shared/ipc';
import {
  LOCAL_API_CHANNELS,
  type LocalApiStatus,
} from '../../shared/local-api';
import { isTrustedIpcEvent } from './note-handlers';

export function registerLocalApiHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  getMainWebContents: () => WebContents | null;
  status: () => LocalApiStatus;
  regenerate: () => Promise<void>;
}) {
  options.ipc.handle(LOCAL_API_CHANNELS.status, (event) =>
    isTrustedIpcEvent(event, options.getMainWebContents())
      ? success(options.status())
      : failure('unavailable'),
  );
  options.ipc.handle(LOCAL_API_CHANNELS.regenerate, async (event) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    await options.regenerate();
    return success(options.status());
  });
  return {
    dispose() {
      options.ipc.removeHandler(LOCAL_API_CHANNELS.status);
      options.ipc.removeHandler(LOCAL_API_CHANNELS.regenerate);
    },
  };
}
