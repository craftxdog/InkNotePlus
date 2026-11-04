import type { StoreApi } from 'zustand/vanilla';
import type { InkNoteApi } from '../../preload/api';
import type { WorkspaceStore, DocumentState } from './workspace-types';
import { mergeNote, toDocument } from './note-projection';

export function dirtyDrafts(state: WorkspaceStore): DocumentState[] {
  return [state.document, ...Object.values(state.parkedDrafts)].filter(
    (draft) => draft.noteId && draft.isDirty,
  );
}

export function createDraftPersistence(
  api: InkNoteApi,
  set: StoreApi<WorkspaceStore>['setState'],
  get: StoreApi<WorkspaceStore>['getState'],
  generation: () => number,
) {
  const inFlight = new Map<string, Promise<boolean>>();
  const find = (id: string) =>
    get().document.noteId === id ? get().document : get().parkedDrafts[id];
  function save(id: string): Promise<boolean> {
    const pending = inFlight.get(id);
    if (pending) return pending;
    const draft = find(id);
    if (!draft?.isDirty || draft.revision === null)
      return Promise.resolve(true);
    const epoch = generation();
    const operation = Promise.resolve().then(async () => {
      set((state) => ({
        noteList: { ...state.noteList, isSaving: true, errorCode: null },
      }));
      try {
        const result = await api.notes.update({
          id,
          title: draft.title,
          body: draft.body,
          metadata: draft.metadata,
          isPinned: draft.isPinned,
          expectedRevision: draft.revision!,
        });
        if (epoch !== generation()) return false;
        if (!result.ok) {
          set((state) => ({
            noteList: {
              ...state.noteList,
              status: 'error',
              errorCode: result.error.code,
            },
          }));
          return false;
        }
        set((state) => {
          const current = find(id);
          const newer =
            current &&
            (current.title !== draft.title ||
              current.body !== draft.body ||
              JSON.stringify(current.metadata) !==
                JSON.stringify(draft.metadata) ||
              current.isPinned !== draft.isPinned);
          const saved = newer
            ? { ...current, revision: result.data.revision, isDirty: true }
            : toDocument(result.data);
          const parkedDrafts = { ...state.parkedDrafts };
          if (state.document.noteId !== id) {
            if (saved.isDirty) parkedDrafts[id] = saved;
            else delete parkedDrafts[id];
          }
          return {
            document: state.document.noteId === id ? saved : state.document,
            parkedDrafts,
            noteList: {
              ...state.noteList,
              notes:
                state.noteList.hasMore ||
                state.noteList.notes.length >= 50 ||
                state.preferences.noteSort === 'title'
                  ? state.noteList.notes.map((note) =>
                      note.id === result.data.id ? result.data : note,
                    )
                  : mergeNote(state.noteList.notes, result.data),
              status: 'ready',
              errorCode: null,
            },
          };
        });
        void get().refreshLibrary();
        if (
          get().searchQuery ||
          get().navigation.type !== 'all' ||
          get().preferences.notebookScopeId ||
          get().preferences.noteSort === 'title' ||
          get().noteList.hasMore ||
          get().noteList.notes.length >= 50
        )
          await get().refreshNotes(true);
        return true;
      } catch {
        if (epoch === generation())
          set((state) => ({
            noteList: {
              ...state.noteList,
              status: 'error',
              errorCode: 'unavailable',
            },
          }));
        return false;
      } finally {
        inFlight.delete(id);
        if (epoch === generation())
          set((state) => ({
            noteList: { ...state.noteList, isSaving: inFlight.size > 0 },
          }));
      }
    });
    inFlight.set(id, operation);
    return operation;
  }
  return {
    save,
    async saveDraft() {
      const id = get().document.noteId;
      if (id) await save(id);
    },
    async flushDrafts(): Promise<boolean> {
      while (dirtyDrafts(get()).length || inFlight.size) {
        const ids = new Set([
          ...dirtyDrafts(get()).map((draft) => draft.noteId!),
          ...inFlight.keys(),
        ]);
        for (const id of ids) if (!(await save(id))) return false;
      }
      return true;
    },
  };
}

export function startAutosave(
  store: StoreApi<WorkspaceStore>,
  save: (id: string) => Promise<boolean>,
) {
  const timers = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; since: number }
  >();
  const stop = store.subscribe((state, previous) => {
    if (
      state.document === previous.document &&
      state.parkedDrafts === previous.parkedDrafts
    )
      return;
    for (const draft of dirtyDrafts(state)) {
      const id = draft.noteId!;
      const old = timers.get(id);
      if (old) clearTimeout(old.timer);
      const since = old?.since ?? Date.now();
      // InkNote's batching policy: save after a short pause, and during continuous typing.
      const delay = Math.max(0, Math.min(600, 2000 - (Date.now() - since)));
      timers.set(id, {
        since,
        timer: setTimeout(() => {
          timers.delete(id);
          void save(id);
        }, delay),
      });
    }
  });
  return () => {
    stop();
    for (const { timer } of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
