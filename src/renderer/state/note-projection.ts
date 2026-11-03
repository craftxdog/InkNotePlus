import type { NoteProjection } from '../../shared/ipc';
import type { DocumentState, WorkspaceState } from './workspace-types';
import { defaultNoteMetadata } from '../../shared/note-metadata';

export const emptyDocument: DocumentState = {
  noteId: null,
  title: '',
  body: '',
  revision: null,
  isDirty: false,
  metadata: defaultNoteMetadata,
  isPinned: false,
};

export function toDocument(note: NoteProjection): DocumentState {
  return {
    noteId: note.id,
    title: note.title,
    body: note.body,
    revision: note.revision,
    isDirty: false,
    metadata: note.metadata ?? defaultNoteMetadata,
    isPinned: note.isPinned,
  };
}

export function sortNotes(
  notes: readonly NoteProjection[],
  includeDeleted = false,
): readonly NoteProjection[] {
  return [...notes]
    .filter((note) =>
      includeDeleted ? note.deletedAt !== null : note.deletedAt === null,
    )
    .sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.id.localeCompare(a.id),
    );
}

export function mergeNote(
  notes: readonly NoteProjection[],
  note: NoteProjection,
): readonly NoteProjection[] {
  const existing = notes.find(({ id }) => id === note.id);
  if (existing && existing.revision > note.revision) return notes;
  return sortNotes([...notes.filter(({ id }) => id !== note.id), note]);
}

export function selectDocument(
  state: WorkspaceState,
  noteId: string | null,
  notes = state.noteList.notes,
) {
  const parkedDrafts = { ...state.parkedDrafts };
  if (state.document.noteId && state.document.isDirty)
    parkedDrafts[state.document.noteId] = state.document;
  const note = notes.find(({ id }) => id === noteId);
  const document = noteId
    ? (parkedDrafts[noteId] ?? (note ? toDocument(note) : emptyDocument))
    : emptyDocument;
  if (noteId) delete parkedDrafts[noteId];
  return { activeNoteId: document.noteId, document, parkedDrafts };
}
