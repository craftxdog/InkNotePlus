import type { IpcMain, WebContents } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { IMAGE_CHANNELS, imageWriteSchema } from '../../shared/images';
import { failure, success } from '../../shared/ipc';
import { storeImage } from '../image-store';
import { isTrustedIpcEvent } from './note-handlers';
export function registerImageHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  userData: string;
  getMainWebContents: () => WebContents | null;
  chooseFile: () => Promise<string | undefined>;
  isDecodable: (bytes: Buffer) => boolean;
}) {
  options.ipc.handle(IMAGE_CHANNELS.import, async (event) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    try {
      const file = await options.chooseFile();
      if (!file) return success(null);
      if ((await stat(file)).size > 5_000_000) return failure('invalid_input');
      return success(
        await storeImage(
          await readFile(file),
          options.userData,
          options.isDecodable,
        ),
      );
    } catch {
      return failure('invalid_input');
    }
  });
  options.ipc.handle(IMAGE_CHANNELS.write, async (event, input: unknown) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    const parsed = imageWriteSchema.safeParse(input);
    if (!parsed.success) return failure('invalid_input');
    try {
      return success(
        await storeImage(
          Buffer.from(parsed.data.base64, 'base64'),
          options.userData,
          options.isDecodable,
        ),
      );
    } catch {
      return failure('invalid_input');
    }
  });
  return {
    dispose() {
      Object.values(IMAGE_CHANNELS).forEach((channel) =>
        options.ipc.removeHandler(channel),
      );
    },
  };
}
