import type { IpcMain, WebContents } from 'electron';
import type { SqliteLibraryRepository } from '../../infrastructure/sqlite/sqlite-library-repository';
import {
  LIBRARY_CHANNELS,
  createNotebookSchema,
  libraryInputSchema,
} from '../../shared/library';
import { failure, success } from '../../shared/ipc';
import { isTrustedIpcEvent } from './note-handlers';
import { setNotebookIconSchema } from '../../shared/notebook-icons';

export function registerLibraryHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  repository: Pick<
    SqliteLibraryRepository,
    'getSnapshot' | 'createNotebook' | 'setNotebookIcon'
  >;
  getMainWebContents: () => WebContents | null;
}) {
  options.ipc.handle(LIBRARY_CHANNELS.get, (event, input: unknown = {}) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    const parsed = libraryInputSchema.safeParse(input);
    if (!parsed.success) return failure('invalid_input');
    try {
      return success(options.repository.getSnapshot(parsed.data));
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
  options.ipc.handle(
    LIBRARY_CHANNELS.setNotebookIcon,
    (event, input: unknown) => {
      if (!isTrustedIpcEvent(event, options.getMainWebContents()))
        return failure('unavailable');
      const parsed = setNotebookIconSchema.safeParse(input);
      if (!parsed.success) return failure('invalid_input');
      try {
        return success(options.repository.setNotebookIcon(parsed.data));
      } catch {
        return failure('unavailable');
      }
    },
  );
  return {
    dispose() {
      options.ipc.removeHandler(LIBRARY_CHANNELS.get);
      options.ipc.removeHandler(LIBRARY_CHANNELS.createNotebook);
      options.ipc.removeHandler(LIBRARY_CHANNELS.setNotebookIcon);
    },
  };
}
