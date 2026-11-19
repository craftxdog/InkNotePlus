import type { IpcMain, WebContents } from 'electron';
import { failure, success } from '../../shared/ipc';
import { KEYMAP_CHANNELS, type KeymapFile } from '../../shared/keymap-file';
import { isTrustedIpcEvent } from './note-handlers';

export function registerKeymapHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  getMainWebContents: () => WebContents | null;
  read: () => KeymapFile;
  ensure: () => string;
  openPath: (target: string) => Promise<string>;
}) {
  options.ipc.handle(KEYMAP_CHANNELS.get, (event) =>
    isTrustedIpcEvent(event, options.getMainWebContents())
      ? success(options.read())
      : failure('unavailable'),
  );
  options.ipc.handle(KEYMAP_CHANNELS.open, async (event) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    try {
      const problem = await options.openPath(options.ensure());
      return problem ? failure('unavailable') : success(true);
    } catch {
      return failure('unavailable');
    }
  });
  return {
    dispose() {
      options.ipc.removeHandler(KEYMAP_CHANNELS.get);
      options.ipc.removeHandler(KEYMAP_CHANNELS.open);
    },
  };
}
