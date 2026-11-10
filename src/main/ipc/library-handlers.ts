import type { IpcMain, WebContents } from 'electron';
import type { ZodType } from 'zod';
import {
  TagNameConflictError,
  type SqliteLibraryRepository,
} from '../../infrastructure/sqlite/sqlite-library-repository';
import {
  LIBRARY_CHANNELS,
  createNotebookSchema,
  deleteNotebookSchema,
  libraryInputSchema,
} from '../../shared/library';
import { failure, success, type Result } from '../../shared/ipc';
import { isTrustedIpcEvent } from './note-handlers';
import { setNotebookIconSchema } from '../../shared/notebook-icons';
import { deleteTagSchema, updateTagSchema } from '../../shared/tags';

export function registerLibraryHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  repository: Pick<
    SqliteLibraryRepository,
    | 'getSnapshot'
    | 'createNotebook'
    | 'setNotebookIcon'
    | 'deleteNotebook'
    | 'updateTag'
    | 'deleteTag'
  >;
  getMainWebContents: () => WebContents | null;
  onLibraryChanged?: () => void;
  onNotebookDeleted?: (ids: string[]) => void;
}) {
  const { ipc, repository } = options;
  const channels: string[] = [];

  function handle<T, R>(
    channel: string,
    schema: ZodType<T>,
    run: (input: T) => Result<R>,
  ) {
    ipc.handle(channel, (event, input: unknown = {}) => {
      if (!isTrustedIpcEvent(event, options.getMainWebContents()))
        return failure('unavailable');
      const parsed = schema.safeParse(input);
      if (!parsed.success) return failure('invalid_input');
      try {
        return run(parsed.data);
      } catch (error) {
        return failure(
          error instanceof TagNameConflictError ? 'conflict' : 'unavailable',
        );
      }
    });
    channels.push(channel);
  }

  function changed<T>(data: T) {
    options.onLibraryChanged?.();
    return success(data);
  }

  handle(LIBRARY_CHANNELS.get, libraryInputSchema, (input) =>
    success(repository.getSnapshot(input)),
  );
  handle(LIBRARY_CHANNELS.createNotebook, createNotebookSchema, (input) =>
    changed(repository.createNotebook(input)),
  );
  handle(LIBRARY_CHANNELS.setNotebookIcon, setNotebookIconSchema, (input) =>
    changed(repository.setNotebookIcon(input)),
  );
  handle(LIBRARY_CHANNELS.deleteNotebook, deleteNotebookSchema, ({ id }) => {
    const ids = repository.deleteNotebook(id);
    if (ids.length) options.onNotebookDeleted?.(ids);
    return ids.length ? changed(ids) : failure('not_found');
  });
  handle(LIBRARY_CHANNELS.updateTag, updateTagSchema, (input) =>
    repository.updateTag(input) ? changed(true) : failure('not_found'),
  );
  handle(LIBRARY_CHANNELS.deleteTag, deleteTagSchema, ({ name }) =>
    repository.deleteTag(name) ? changed(true) : failure('not_found'),
  );
  return {
    dispose: () => channels.forEach((channel) => ipc.removeHandler(channel)),
  };
}
