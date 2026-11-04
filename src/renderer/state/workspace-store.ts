import { createStore, type StoreApi } from 'zustand/vanilla';
import { createDraftPersistence, startAutosave } from './draft-persistence';
import { updateTaskMarker } from '../editor/markdown-source-map';

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
  matchesNavigation,
} from './library-actions';
import { loadNoteWindow } from './note-loading';

export function createWorkspaceStore(api: InkNoteApi) {
  let requestId = 0;
  let generation = 0;
  let connections = 0;
  let unsubscribe: (() => void) | undefined;
  let preferenceQueue = Promise.resolve();
  let preferenceRevision = 0;
  let confirmedPreferences = defaultPreferences;
  let stopAutosave: (() => void) | undefined;
  let stopClose: (() => void) | undefined;

  const store: StoreApi<WorkspaceStore> = createStore<WorkspaceStore>()((
    set,
    get,
  ) => {
    const persistence = createDraftPersistence(api, set, get, () => generation);
    const reportFailure = (errorCode: AppErrorCode) =>
      set((state) => ({
        noteList: { ...state.noteList, status: 'error', errorCode },
      }));

    const refreshNotes = async (
      append = false,
      preserveLoaded = false,
    ): Promise<void> => {
      const currentRequest = ++requestId;
      const query = get().searchQuery;
      const offset = append ? get().noteList.notes.length : 0;
      const filter = {
        ...navigationFilter(get().navigation, get().preferences),
      };
      set((state) => ({
        noteList: { ...state.noteList, status: 'loading', errorCode: null },
      }));
      try {
        const count =
          preserveLoaded && !append
            ? Math.max(50, Math.ceil(get().noteList.notes.length / 50) * 50)
            : 50;
        const result = await loadNoteWindow(
          api,
          query,
          filter,
          offset,
          count,
          () => currentRequest === requestId,
        );
        if (!result) return;
        if (currentRequest !== requestId) return;
        if (!result.ok) {
          reportFailure(result.error.code);
          return;
        }
        set((state) => {
          const notes = append
            ? [
                ...state.noteList.notes,
                ...result.data.notes.filter(
                  (note) =>
                    !state.noteList.notes.some(
                      (existing) => existing.id === note.id,
                    ),
                ),
              ]
            : result.data.notes;
          const activeNoteId = notes.some(({ id }) => id === state.activeNoteId)
            ? state.activeNoteId
            : (notes[0]?.id ?? null);
          return {
            ...((preserveLoaded || state.noteList.isCreating) &&
            !state.searchQuery &&
            matchesNavigation(
              state.document.metadata,
              state.navigation,
              state.preferences,
              state.library.notebooks,
            ) &&
            state.document.noteId &&
            !notes.some((note) => note.id === state.document.noteId)
              ? {}
              : selectDocument(state, activeNoteId, notes)),
            noteList: {
              ...state.noteList,
              notes,
              status: 'ready',
              errorCode: null,
              hasMore: result.data.hasMore,
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
      if (event.type === 'trashed' && get().activeNoteId === event.note.id)
        get().selectNote(null);
      else if (
        get().activeNoteId === event.note.id &&
        !get().document.isDirty &&
        event.note.revision >= (get().document.revision ?? 0)
      )
        set({ document: toDocument(event.note) });
      if (
        get().searchQuery ||
        get().preferences.notebookScopeId ||
        get().navigation.type !== 'all' ||
        get().noteList.status === 'loading' ||
        get().noteList.hasMore ||
        get().noteList.notes.length >= 50 ||
        get().preferences.noteSort === 'title'
      ) {
        void refreshNotes(false, true);
      } else {
        applyNote(event.note);
      }
      void get().refreshLibrary();
    };

    return {
      saveDraft: persistence.saveDraft,
      flushDrafts: persistence.flushDrafts,
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
        const commit = (
          preferences: typeof defaultPreferences,
          preferencesError: boolean,
        ) => {
          const old = get().preferences;
          set({ preferences, preferencesError });
          if (
            old.notebookScopeId !== preferences.notebookScopeId ||
            old.noteSort !== preferences.noteSort ||
            JSON.stringify(old.expandedNotebookIds) !==
              JSON.stringify(preferences.expandedNotebookIds)
          )
            void refreshNotes(false, true);
        };
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
              commit(
                result.ok ? result.data : confirmedPreferences,
                !result.ok,
              );
          } catch {
            if (
              revision === preferenceRevision &&
              currentGeneration === generation
            )
              commit(confirmedPreferences, true);
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
        hasMore: false,
      },
      document: emptyDocument,
      parkedDrafts: {},
      connect(beforeFlush = () => {}) {
        connections += 1;
        if (connections === 1) {
          stopAutosave = startAutosave(store, persistence.save);
          stopClose = api.onBeforeClose(async () => {
            beforeFlush();
            await preferenceQueue;
            return get().flushDrafts();
          });
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
              void refreshNotes();
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
            stopAutosave?.();
            stopAutosave = undefined;
            stopClose?.();
            stopClose = undefined;
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
      refreshNotes: (preserveLoaded = false) =>
        refreshNotes(false, preserveLoaded),
      async loadMoreNotes() {
        if (get().noteList.hasMore && get().noteList.status !== 'loading')
          await refreshNotes(true);
      },
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
            metadata: metadataForNewNote(get().navigation, get().preferences),
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
      toggleTask(snapshot, offset, checked) {
        if (
          get().navigation.type === 'trash' ||
          get().document.body !== snapshot
        )
          return;
        const body = updateTaskMarker(snapshot, offset, checked);
        if (body !== null) get().updateDraft({ body });
      },
    };
  });
  return store;
}

export type WorkspaceStoreApi = ReturnType<typeof createWorkspaceStore>;
