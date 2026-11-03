import type { IpcMain, WebContents } from 'electron';
import {
  EXTERNAL_LINK_CHANNEL,
  externalLinkSchema,
} from '../../shared/external-link';
import { failure, success } from '../../shared/ipc';
import { isTrustedIpcEvent } from './note-handlers';

export function registerExternalLinkHandler(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  getMainWebContents: () => WebContents | null;
  openExternal: (url: string) => Promise<void>;
}) {
  options.ipc.handle(EXTERNAL_LINK_CHANNEL, async (event, input: unknown) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    const parsed = externalLinkSchema.safeParse(input);
    if (!parsed.success) return failure('invalid_input');
    try {
      await options.openExternal(parsed.data.url);
      return success(true);
    } catch {
      return failure('unavailable');
    }
  });
  return {
    dispose() {
      options.ipc.removeHandler(EXTERNAL_LINK_CHANNEL);
    },
  };
}
