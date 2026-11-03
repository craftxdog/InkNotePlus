import type {
  AppErrorCode,
  NoteProjection,
  Result,
  UpdateNoteInput,
} from '../../shared/ipc';
import { useNoteListStore } from '../state/note-list-store';
import { useWorkspaceStore } from '../state/workspace-store';

const untitledNoteTitle = 'Nota sin título';
let latestQueryRequestId = 0;

export async function refreshNotes(query: string): Promise<void> {
  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    await searchNotes(normalizedQuery);
    return;
  }

  await loadNotes();
}

export async function loadNotes(): Promise<void> {
  await loadNoteProjection('', () => window.inkNote.notes.list());
}

export async function searchNotes(query: string): Promise<void> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    await loadNotes();
    return;
  }

  await loadNoteProjection(normalizedQuery, () =>
    window.inkNote.notes.search({ query: normalizedQuery }),
  );
}

export async function createNote(): Promise<void> {
  const noteStore = useNoteListStore.getState();
  noteStore.setCreating(true);

  try {
    const result = await window.inkNote.notes.create({
      title: untitledNoteTitle,
      body: '',
    });
    applyMutationResult(result, (note) => {
      invalidateNoteProjection();
      const projectionQuery = useNoteListStore.getState().projectionQuery;
      if (projectionQuery) {
        useWorkspaceStore.getState().setSearchQuery('');
      }
      useNoteListStore.getState().upsertNote(note);
      useWorkspaceStore.getState().selectNote(note.id);
      if (projectionQuery) {
        void loadNotes();
      }
    });
  } catch {
    useNoteListStore.getState().setError('unavailable');
  } finally {
    useNoteListStore.getState().setCreating(false);
  }
}

export async function saveNote(input: UpdateNoteInput): Promise<void> {
  useNoteListStore.getState().setSaving(true);

  try {
    const result = await window.inkNote.notes.update(input);
    applyMutationResult(result, (note) => {
      invalidateNoteProjection();
      const projectionQuery = useNoteListStore.getState().projectionQuery;
      if (projectionQuery) {
        void refreshNotes(projectionQuery);
        return;
      }
      useNoteListStore.getState().upsertNote(note);
    });
  } catch {
    useNoteListStore.getState().setError('unavailable');
  } finally {
    useNoteListStore.getState().setSaving(false);
  }
}

export async function moveNoteToTrash(noteId: string): Promise<void> {
  try {
    const result = await window.inkNote.notes.moveToTrash({ id: noteId });
    applyMutationResult(result, (note) => {
      invalidateNoteProjection();
      useNoteListStore.getState().applyNoteChanged({ type: 'trashed', note });
      if (useWorkspaceStore.getState().activeNoteId === note.id) {
        useWorkspaceStore.getState().selectNote(null);
      }
    });
  } catch {
    useNoteListStore.getState().setError('unavailable');
  }
}

export function subscribeToNoteChanges(): () => void {
  return window.inkNote.onNoteChanged((event) => {
    invalidateNoteProjection();
    const projectionQuery = useNoteListStore.getState().projectionQuery;
    if (event.type !== 'trashed' && projectionQuery) {
      void refreshNotes(projectionQuery);
      return;
    }

    useNoteListStore.getState().applyNoteChanged(event);
    if (
      event.type === 'trashed' &&
      useWorkspaceStore.getState().activeNoteId === event.note.id
    ) {
      useWorkspaceStore.getState().selectNote(null);
    }
  });
}

async function loadNoteProjection(
  query: string,
  request: () => Promise<Result<NoteProjection[]>>,
): Promise<void> {
  const requestId = ++latestQueryRequestId;
  useNoteListStore.getState().setLoading(query);

  try {
    const result = await request();
    if (requestId !== latestQueryRequestId) {
      return;
    }

    if (result.ok) {
      useNoteListStore.getState().replaceNotes(result.data);
      selectFirstVisibleNote(result.data);
      return;
    }

    useNoteListStore.getState().setError(result.error.code);
  } catch {
    if (requestId === latestQueryRequestId) {
      useNoteListStore.getState().setError('unavailable');
    }
  }
}

function invalidateNoteProjection(): void {
  latestQueryRequestId += 1;
}

function applyMutationResult(
  result: Result<NoteProjection>,
  applySuccess: (note: NoteProjection) => void,
): void {
  if (result.ok) {
    applySuccess(result.data);
    return;
  }

  useNoteListStore.getState().setError(result.error.code);
}

function selectFirstVisibleNote(notes: NoteProjection[]): void {
  const workspaceStore = useWorkspaceStore.getState();
  const activeNoteId = workspaceStore.activeNoteId;
  if (activeNoteId && notes.some(({ id }) => id === activeNoteId)) {
    return;
  }

  workspaceStore.selectNote(notes[0]?.id ?? null);
}

export function getSafeErrorMessage(errorCode: AppErrorCode): string {
  switch (errorCode) {
    case 'invalid_input':
      return 'La información de la nota no es válida.';
    case 'not_found':
      return 'La nota ya no está disponible.';
    case 'conflict':
      return 'La nota cambió en otra vista. Revisa la versión más reciente.';
    case 'unavailable':
      return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
}
