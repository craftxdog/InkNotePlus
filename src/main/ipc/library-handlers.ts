import type { IpcMain, WebContents } from 'electron';
import type { SqliteLibraryRepository } from '../../infrastructure/sqlite/sqlite-library-repository';
import { LIBRARY_CHANNELS, createNotebookSchema } from '../../shared/library';
import { failure, success } from '../../shared/ipc';
import { isTrustedIpcEvent } from './note-handlers';

export function registerLibraryHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  repository: Pick<SqliteLibraryRepository, 'getSnapshot' | 'createNotebook'>;
  getMainWebContents: () => WebContents | null;
}) {
  options.ipc.handle(LIBRARY_CHANNELS.get, (event) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    try {
      return success(options.repository.getSnapshot());
    } catch {
      return failure('unavailable');
    }
  });
  options.ipc.handle(
    LIBRARY_CHANNELS.createNotebook,
    (event, input: unknown) => {
      if (!isTrustedIpcEvent(event, options.getMainWebContents()))
        return failure('unavailable');
      const parsed = createNotebookSchema.safeParse(input);
      if (!parsed.success) return failure('invalid_input');
      try {
        return success(options.repository.createNotebook(parsed.data));
      } catch {
        return failure('unavailable');
      }
    },
  );
  return {
    dispose() {
      options.ipc.removeHandler(LIBRARY_CHANNELS.get);
      options.ipc.removeHandler(LIBRARY_CHANNELS.createNotebook);
    },
  };
}
