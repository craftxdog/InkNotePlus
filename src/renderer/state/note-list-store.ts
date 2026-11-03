import { create } from 'zustand';

import type {
  AppErrorCode,
  NoteChangedEvent,
  NoteProjection,
} from '../../shared/ipc';

export type NoteListStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface NoteListState {
  notes: NoteProjection[];
  status: NoteListStatus;
  errorCode: AppErrorCode | null;
  projectionQuery: string;
  isCreating: boolean;
  isSaving: boolean;
  replaceNotes(notes: NoteProjection[]): void;
  upsertNote(note: NoteProjection): void;
  removeNote(noteId: string): void;
  applyNoteChanged(event: NoteChangedEvent): void;
  setLoading(projectionQuery?: string): void;
  setError(errorCode: AppErrorCode): void;
  setCreating(isCreating: boolean): void;
  setSaving(isSaving: boolean): void;
}

export const initialNoteListState = {
  notes: [],
  status: 'idle',
  errorCode: null,
  projectionQuery: '',
  isCreating: false,
  isSaving: false,
} satisfies Pick<
  NoteListState,
  | 'notes'
  | 'status'
  | 'errorCode'
  | 'projectionQuery'
  | 'isCreating'
  | 'isSaving'
>;

export const useNoteListStore = create<NoteListState>()((set) => ({
  ...initialNoteListState,
  replaceNotes: (notes) =>
    set({
      notes: sortNotes(notes.filter(({ deletedAt }) => deletedAt === null)),
      status: 'ready',
      errorCode: null,
    }),
  upsertNote: (note) => set((state) => projectNote(state, note)),
  removeNote: (noteId) =>
    set((state) => ({
      notes: state.notes.filter(({ id }) => id !== noteId),
      status: 'ready',
      errorCode: null,
    })),
  applyNoteChanged: (event) =>
    set((state) => projectNote(state, event.note, event.type === 'trashed')),
  setLoading: (projectionQuery = '') =>
    set({ status: 'loading', errorCode: null, projectionQuery }),
  setError: (errorCode) => set({ status: 'error', errorCode }),
  setCreating: (isCreating) => set({ isCreating }),
  setSaving: (isSaving) => set({ isSaving }),
}));

function projectNote(
  state: Pick<NoteListState, 'notes'>,
  note: NoteProjection,
  shouldRemove = note.deletedAt !== null,
): Pick<NoteListState, 'notes' | 'status' | 'errorCode'> {
  const notesWithoutCurrent = state.notes.filter(({ id }) => id !== note.id);

  return {
    notes: !shouldRemove
      ? sortNotes([...notesWithoutCurrent, note])
      : notesWithoutCurrent,
    status: 'ready',
    errorCode: null,
  };
}

function sortNotes(notes: NoteProjection[]): NoteProjection[] {
  return [...notes].sort((left, right) => {
    const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
    return byUpdatedAt === 0 ? right.id.localeCompare(left.id) : byUpdatedAt;
  });
}
