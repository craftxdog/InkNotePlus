import { type Disposable, type CommandRegistry } from './command-registry';
import {
  failure,
  success,
  type CreateNoteInput,
  type ListNotesInput,
  type NoteIdInput,
  type NoteProjection,
  type Result,
  type SearchNotesInput,
  type UpdateNoteInput,
} from '../shared/ipc';
import {
  NoteConflictError,
  NoteNotFoundError,
  type NoteRepository,
} from '../domain/note-repository';

export const NOTE_COMMAND_IDS = {
  create: 'notes:create',
  update: 'notes:update',
  list: 'notes:list',
  search: 'notes:search',
  moveToTrash: 'notes:move-to-trash',
  restore: 'notes:restore',
} as const;

export function registerNoteCommands(
  registry: CommandRegistry,
  repository: NoteRepository,
): Disposable {
  const registrations = [
    registry.register<CreateNoteInput, Result<NoteProjection>>({
      id: NOTE_COMMAND_IDS.create,
      execute: (input) => runNoteCommand(() => repository.create(input)),
    }),
    registry.register<UpdateNoteInput, Result<NoteProjection>>({
      id: NOTE_COMMAND_IDS.update,
      execute: (input) => runNoteCommand(() => repository.update(input)),
    }),
    registry.register<ListNotesInput, Result<NoteProjection[]>>({
      id: NOTE_COMMAND_IDS.list,
      execute: (input) => runNoteCommand(() => repository.list(input)),
    }),
    registry.register<SearchNotesInput, Result<NoteProjection[]>>({
      id: NOTE_COMMAND_IDS.search,
      execute: (input) => runNoteCommand(() => repository.search(input)),
    }),
    registry.register<NoteIdInput, Result<NoteProjection>>({
      id: NOTE_COMMAND_IDS.moveToTrash,
      execute: ({ id }) => runNoteCommand(() => repository.moveToTrash(id)),
    }),
    registry.register<NoteIdInput, Result<NoteProjection>>({
      id: NOTE_COMMAND_IDS.restore,
      execute: ({ id }) => runNoteCommand(() => repository.restore(id)),
    }),
  ];

  return {
    dispose: () => {
      for (const registration of registrations.toReversed()) {
        registration.dispose();
      }
    },
  };
}

function runNoteCommand<T>(action: () => T): Result<T> {
  try {
    return success(action());
  } catch (error) {
    if (error instanceof NoteNotFoundError) {
      return failure('not_found');
    }
    if (error instanceof NoteConflictError) {
      return failure('conflict');
    }

    return failure('unavailable');
  }
}
