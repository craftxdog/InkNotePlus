import type { CommandRegistry } from '../../application/command-registry';
import { NOTE_COMMAND_IDS } from '../../application/note-commands';
import type { SqliteLibraryRepository } from '../../infrastructure/sqlite/sqlite-library-repository';
import {
  failure,
  success,
  type CreateNoteInput,
  type ListNotesInput,
  type NoteChangedEvent,
  type NoteProjection,
  type Result,
  type SearchNotesInput,
  type UpdateNoteInput,
} from '../../shared/ipc';

export type NotesBackend = ReturnType<typeof createNotesBackend>;

export function createNotesBackend(options: {
  commands: CommandRegistry;
  library: Pick<SqliteLibraryRepository, 'getSnapshot'>;
  publish: (event: NoteChangedEvent) => void;
}) {
  async function run<T>(id: string, input: unknown): Promise<Result<T>> {
    try {
      const execution = await options.commands.execute<Result<T>>(id, input);
      return execution.ok ? execution.data : failure('unavailable');
    } catch {
      return failure('unavailable');
    }
  }
  // The app refreshes open notes and lists from the same event it uses for itself.
  async function mutate(
    id: string,
    input: unknown,
    type: NoteChangedEvent['type'],
  ) {
    const result = await run<NoteProjection>(id, input);
    if (result.ok) options.publish({ type, note: result.data });
    return result;
  }
  const list = (input: ListNotesInput) =>
    run<NoteProjection[]>(NOTE_COMMAND_IDS.list, input);

  return {
    list,
    search: (input: SearchNotesInput) =>
      run<NoteProjection[]>(NOTE_COMMAND_IDS.search, input),
    async get(id: string): Promise<Result<NoteProjection>> {
      for (const trashed of [false, true]) {
        const result = await list({ id, trashed, limit: 1 });
        if (!result.ok) return result;
        if (result.data[0]) return success(result.data[0]);
      }
      return failure('not_found');
    },
    create: (input: CreateNoteInput) =>
      mutate(NOTE_COMMAND_IDS.create, input, 'created'),
    update: (input: UpdateNoteInput) =>
      mutate(NOTE_COMMAND_IDS.update, input, 'updated'),
    trash: (id: string) =>
      mutate(NOTE_COMMAND_IDS.moveToTrash, { id }, 'trashed'),
    books: () => options.library.getSnapshot().notebooks,
    tags: () => options.library.getSnapshot().tags,
  };
}
