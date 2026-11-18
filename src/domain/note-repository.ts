import type {
  CreateNoteInput,
  ListNotesInput,
  Note,
  NoteId,
  SearchNotesInput,
  UpdateNoteInput,
} from './note';
import type {
  ManageTrashInput,
  NoteRevision,
  NoteRevisionSummary,
} from '../shared/ipc';

export interface NoteRepository {
  create(input: CreateNoteInput): Note;
  update(input: UpdateNoteInput): Note;
  list(input?: ListNotesInput): Note[];
  search(input: SearchNotesInput): Note[];
  moveToTrash(id: NoteId): Note;
  restore(id: NoteId): Note;
  manageTrash(input: ManageTrashInput): number;
  listRevisions(id: NoteId): NoteRevisionSummary[];
  getRevision(id: NoteId, revision: number): NoteRevision;
}

export class NoteNotFoundError extends Error {
  constructor(noteId: NoteId) {
    super(`Note not found: ${noteId}`);
    this.name = 'NoteNotFoundError';
  }
}

export class NoteConflictError extends Error {
  constructor(noteId: NoteId) {
    super(`Note revision conflict: ${noteId}`);
    this.name = 'NoteConflictError';
  }
}
