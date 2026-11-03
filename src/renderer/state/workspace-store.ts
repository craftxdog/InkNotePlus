import { createStore } from 'zustand/vanilla';

import type { InkNoteApi } from '../../preload/api';
import type {
  AppErrorCode,
  NoteChangedEvent,
  NoteProjection,
} from '../../shared/ipc';
import {
  emptyDocument,
  mergeNote,
  selectDocument,
  sortNotes,
  toDocument,
} from './note-projection';
import type { WorkspaceStore } from './workspace-types';
import {
  defaultPreferences,
  preferencesPatchSchema,
} from '../../shared/preferences';
import { emptyLibrary, defaultNoteMetadata } from '../../shared/library';
import {
  createLibraryActions,
  navigationFilter,
  metadataForNewNote,
} from './library-actions';

export function createWorkspaceStore(api: InkNoteApi) {
  let requestId = 0;
  let generation = 0;
  let connections = 0;
  let unsubscribe: (() => void) | undefined;
  let preferenceQueue = Promise.resolve();
  let preferenceRevision = 0;
  let confirmedPreferences = defaultPreferences;

  return createStore<WorkspaceStore>()((set, get) => {
    const reportFailure = (errorCode: AppErrorCode) =>
      set((state) => ({
        noteList: { ...state.noteList, status: 'error', errorCode },
      }));

    const refreshNotes = async (): Promise<void> => {
      const currentRequest = ++requestId;
      const query = get().searchQuery;
      const filter = navigationFilter(get().navigation);
      set((state) => ({
        noteList: { ...state.noteList, status: 'loading', errorCode: null },
      }));
      try {
        const result = query
          ? await api.notes.search({ query, ...filter })
          : await api.notes.list(filter);
        if (currentRequest !== requestId) return;
        if (!result.ok) {
          reportFailure(result.error.code);
          return;
        }
        set((state) => {
          const notes = sortNotes(
            result.data,
            get().navigation.type === 'trash',
          );
          const activeNoteId = notes.some(({ id }) => id === state.activeNoteId)
            ? state.activeNoteId
            : (notes[0]?.id ?? null);
          return {
            ...selectDocument(state, activeNoteId, notes),
            noteList: {
              ...state.noteList,
              notes,
              status: 'ready',
              errorCode: null,
            },
          };
        });
        void get().refreshLibrary();
      } catch {
        if (currentRequest === requestId) reportFailure('unavailable');
      }
    };

    const applyNote = (note: NoteProjection) =>
      set((state) => {
        const notes = state.searchQuery
          ? state.noteList.notes
          : mergeNote(state.noteList.notes, note);
        const activeNoteId = notes.some(({ id }) => id === state.activeNoteId)
          ? state.activeNoteId
          : (notes[0]?.id ?? null);
        return {
          ...selectDocument(state, activeNoteId, notes),
          noteList: {
            ...state.noteList,
            notes,
            status: 'ready',
            errorCode: null,
          },
        };
      });

    const onNoteChanged = (event: NoteChangedEvent) => {
      if (
        get().searchQuery ||
        get().navigation.type !== 'all' ||
        get().noteList.status === 'loading'
      ) {
        void refreshNotes();
      } else {
        applyNote(event.note);
      }
      void get().refreshLibrary();
    };

    return {
      openExternalLink: (url) => api.links.openExternal(url),
      ...createLibraryActions(api, set, get, () => generation),
      navigation: { type: 'all' },
      library: emptyLibrary,
      notebookDialogOpen: false,
      preferences: defaultPreferences,
      styleNonce: null,
      platform: 'linux',
      preferencesError: false,
      settingsOpen: false,
      setSettingsOpen(settingsOpen) {
        set({ settingsOpen });
      },
      updatePreferences(patch) {
        const parsed = preferencesPatchSchema.safeParse(patch);
        if (!parsed.success) {
          set({ preferencesError: true });
          return Promise.resolve();
        }
        const revision = ++preferenceRevision;
        const currentGeneration = generation;
        set((state) => ({
          preferences: { ...state.preferences, ...parsed.data },
          preferencesError: false,
        }));
        preferenceQueue = preferenceQueue.then(async () => {
          try {
            const result = await api.preferences.update(parsed.data);
            if (currentGeneration !== generation) return;
            if (result.ok) confirmedPreferences = result.data;
            if (revision === preferenceRevision)
              set({
                preferences: result.ok ? result.data : confirmedPreferences,
                preferencesError: !result.ok,
              });
          } catch {
            if (
              revision === preferenceRevision &&
              currentGeneration === generation
            )
              set({
                preferences: confirmedPreferences,
                preferencesError: true,
              });
          }
        });
        return preferenceQueue;
      },
      activeNoteId: null,
      searchQuery: '',
      mainLayout: { sidebarVisible: true, distractionFreeEnabled: false },
      noteList: {
        notes: [],
        status: 'idle',
        errorCode: null,
        isCreating: false,
        isSaving: false,
      },
      document: emptyDocument,
      parkedDrafts: {},
      connect() {
        connections += 1;
        if (connections === 1) {
          unsubscribe = api.onNoteChanged(onNoteChanged);
          void refreshNotes();
          const currentGeneration = generation;
          const revision = preferenceRevision;
          void api.preferences
            .get()
            .then((result) => {
              if (currentGeneration !== generation) return;
              if (!result.ok) {
                set({ preferencesError: true });
                return;
              }
              confirmedPreferences = result.data.preferences;
              set((state) => ({
                styleNonce: result.data.styleNonce,
                platform: result.data.platform,
                preferences:
                  revision === preferenceRevision
                    ? result.data.preferences
                    : state.preferences,
                preferencesError: false,
              }));
            })
            .catch(() => {
              if (currentGeneration === generation)
                set({ preferencesError: true });
            });
        }
        let disconnected = false;
        return () => {
          if (disconnected) return;
          disconnected = true;
          connections -= 1;
          if (connections === 0) {
            unsubscribe?.();
            unsubscribe = undefined;
            requestId += 1;
            generation += 1;
            set((state) => ({
              noteList: {
                ...state.noteList,
                isCreating: false,
                isSaving: false,
              },
            }));
          }
        };
      },
      refreshNotes,
      async setSearchQuery(query) {
        set({ searchQuery: query.trim() });
        await refreshNotes();
      },
      selectNote(noteId) {
        set((state) => selectDocument(state, noteId));
      },
      setSidebarVisible(visible) {
        set((state) => ({
          mainLayout: { ...state.mainLayout, sidebarVisible: visible },
        }));
      },
      setDistractionFreeEnabled(enabled) {
        set((state) => ({
          mainLayout: { ...state.mainLayout, distractionFreeEnabled: enabled },
        }));
      },
      async createNote() {
        if (get().noteList.isCreating) return;
        const currentGeneration = generation;
        set((state) => ({
          noteList: { ...state.noteList, isCreating: true, errorCode: null },
        }));
        try {
          const result = await api.notes.create({
            title: 'Nota sin título',
            body: '',
            metadata: metadataForNewNote(get().navigation),
          });
          if (currentGeneration !== generation) return;
          if (!result.ok) {
            reportFailure(result.error.code);
            return;
          }
          requestId += 1;
          set((state) => {
            const notes = mergeNote(
              state.searchQuery ? [] : state.noteList.notes,
              result.data,
            );
            return {
              ...selectDocument(state, result.data.id, notes),
              searchQuery: '',
              navigation:
                state.navigation.type === 'trash'
                  ? { type: 'all' }
                  : state.navigation,
              noteList: {
                ...state.noteList,
                notes,
                status: 'ready',
                errorCode: null,
              },
            };
          });
          await refreshNotes();
        } catch {
          if (currentGeneration === generation) reportFailure('unavailable');
        } finally {
          if (currentGeneration === generation)
            set((state) => ({
              noteList: { ...state.noteList, isCreating: false },
            }));
        }
      },
      updateDraft(changes) {
        set((state) => {
          if (!state.document.noteId) return state;
          const document = { ...state.document, ...changes };
          const confirmed = state.noteList.notes.find(
            ({ id }) => id === document.noteId,
          );
          return {
            document: {
              ...document,
              isDirty:
                !confirmed ||
                document.title !== confirmed.title ||
                document.body !== confirmed.body ||
                JSON.stringify(document.metadata) !==
                  JSON.stringify(confirmed?.metadata ?? defaultNoteMetadata) ||
                document.isPinned !== confirmed?.isPinned,
            },
          };
        });
      },
      async saveDraft() {
        const draft = get().document;
        if (
          !draft.noteId ||
          draft.revision === null ||
          !draft.isDirty ||
          get().noteList.isSaving
        )
          return;
        const currentGeneration = generation;
        set((state) => ({
          noteList: { ...state.noteList, isSaving: true, errorCode: null },
        }));
        try {
          const result = await api.notes.update({
            id: draft.noteId,
            title: draft.title,
            body: draft.body,
            expectedRevision: draft.revision,
            metadata: draft.metadata,
            isPinned: draft.isPinned,
          });
          if (currentGeneration !== generation) return;
          if (!result.ok) {
            reportFailure(result.error.code);
            return;
          }
          set((state) => {
            const current =
              state.document.noteId === draft.noteId
                ? state.document
                : state.parkedDrafts[draft.noteId!];
            const saved =
              current &&
              (current.title !== draft.title ||
                current.body !== draft.body ||
                JSON.stringify(current.metadata) !==
                  JSON.stringify(draft.metadata) ||
                current.isPinned !== draft.isPinned)
                ? { ...current, revision: result.data.revision, isDirty: true }
                : toDocument(result.data);
            const parkedDrafts = { ...state.parkedDrafts };
            if (state.document.noteId !== draft.noteId) {
              if (saved.isDirty) parkedDrafts[draft.noteId!] = saved;
              else delete parkedDrafts[draft.noteId!];
            }
            return {
              document:
                state.document.noteId === draft.noteId ? saved : state.document,
              parkedDrafts,
              noteList: {
                ...state.noteList,
                notes: mergeNote(state.noteList.notes, result.data),
                status: 'ready',
                errorCode: null,
              },
            };
          });
          void get().refreshLibrary();
          if (get().searchQuery || get().navigation.type !== 'all')
            await refreshNotes();
        } catch {
          if (currentGeneration === generation) reportFailure('unavailable');
        } finally {
          if (currentGeneration === generation)
            set((state) => ({
              noteList: { ...state.noteList, isSaving: false },
            }));
        }
      },
    };
  });
}

export type WorkspaceStoreApi = ReturnType<typeof createWorkspaceStore>;
