import { createStore, type StoreApi } from 'zustand/vanilla';
import { createDraftPersistence, startAutosave } from './draft-persistence';
import { updateTaskMarker } from '../editor/markdown-source-map';

import type { InkNoteApi } from '../../preload/api';
import type {
  AppErrorCode,
  NoteChangedEvent,
  NoteProjection,
} from '../../shared/ipc';
import { failure, success } from '../../shared/ipc';
import { linkedNoteId } from '../../shared/note-link';
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
import { createThemeActions } from './theme-actions';

export function createWorkspaceStore(api: InkNoteApi) {
  let requestId = 0;
  let linkRequest = 0;
  let linkedDocument: {
    id: string;
    navigation: WorkspaceStore['navigation'];
    scopeId: string | null;
    query: string;
  } | null = null;
  let generation = 0;
  let connections = 0;
  let unsubscribe: (() => void) | undefined;
  let preferenceQueue = Promise.resolve();
  let preferenceRevision = 0;
  let confirmedPreferences = defaultPreferences;
  let stopAutosave: (() => void) | undefined;
  let stopClose: (() => void) | undefined;
  let stopStyles: (() => void) | undefined;

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
        ...(get().searchGlobal
          ? { sort: get().preferences.noteSort }
          : navigationFilter(get().navigation, get().preferences)),
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
          const inList = notes.some(({ id }) => id === state.activeNoteId);
          const activeNoteId = inList
            ? state.activeNoteId
            : (notes[0]?.id ?? null);
          const preserveLink =
            linkedDocument?.id === state.document.noteId &&
            linkedDocument?.navigation === state.navigation &&
            linkedDocument.scopeId === state.preferences.notebookScopeId &&
            linkedDocument.query === state.searchQuery;
          const preserveDraft =
            (preserveLoaded || state.noteList.isCreating) &&
            !state.searchQuery &&
            matchesNavigation(
              state.document.metadata,
              state.navigation,
              state.preferences,
              state.library.notebooks,
            );
          return {
            ...(!inList &&
            state.document.noteId &&
            (preserveLink || preserveDraft)
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
      importImage: (base64) =>
        base64 ? api.images.write(base64) : api.images.importFile(),
      ...createThemeActions(api, set, get),
      saveDraft: persistence.saveDraft,
      flushDrafts: persistence.flushDrafts,
      openExternalLink: (url) => api.links.openExternal(url),
      async openNoteLink(url) {
        const id = linkedNoteId(url);
        if (!id) return failure('invalid_input');
        const initial = get();
        const request = ++linkRequest;
        const currentGeneration = generation;
        const cached = initial.noteList.notes.find(
          (note) => note.id === id && !note.deletedAt,
        );
        const result = cached
          ? success([cached])
          : await api.notes.list({ id, limit: 1 });
        const state = get();
        if (
          request !== linkRequest ||
          currentGeneration !== generation ||
          state.activeNoteId !== initial.activeNoteId ||
          state.navigation !== initial.navigation ||
          state.searchQuery !== initial.searchQuery
        )
          return success(false);
        if (!result.ok) return result;
        const note = result.data.find(
          (value) => value.id === id && !value.deletedAt,
        );
        if (!note) return failure('not_found');
        if (state.navigation.type === 'trash') {
          await state.navigate({ type: 'all' });
          if (request !== linkRequest || currentGeneration !== generation)
            return success(false);
        }
        const current = get();
        linkedDocument = {
          id,
          navigation: current.navigation,
          scopeId: current.preferences.notebookScopeId,
          query: current.searchQuery,
        };
        set((value) => selectDocument(value, id, [note]));
        return success(true);
      },
      searchLinkNotes(query) {
        const title = query.trim();
        return api.notes.list({
          limit: 10,
          ...(title ? { titleContains: title } : {}),
        });
      },
      createLinkedNote(title) {
        const { navigation, preferences } = get();
        return api.notes.create({
          title,
          body: '',
          metadata: metadataForNewNote(navigation, preferences),
        });
      },
      ...createLibraryActions(api, set, get, () => generation),
      navigation: { type: 'all' },
      library: emptyLibrary,
      notebookDialogOpen: false,
      notebookDialogParentId: null,
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
      searchGlobal: false,
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
      templatePickerOpen: false,
      commandPaletteOpen: false,
      setCommandPaletteOpen(commandPaletteOpen) {
        set({ commandPaletteOpen });
      },
      setTemplatePickerOpen(templatePickerOpen) {
        if (
          templatePickerOpen &&
          (!get().document.noteId ||
            get().document.body.trim() ||
            get().navigation.type === 'trash' ||
            get().document.metadata.isTemplate)
        )
          return;
        set({ templatePickerOpen });
      },
      getTemplateNotes(query = '', offset = 0) {
        return query.trim()
          ? api.notes.search({ query, templates: true, offset, limit: 100 })
          : api.notes.list({ templates: true, offset, limit: 100 });
      },
      async applyTemplate(source) {
        const document = get().document;
        if (
          !document.noteId ||
          document.body.trim() ||
          get().navigation.type === 'trash' ||
          document.metadata.isTemplate
        )
          return 'La plantilla sólo se puede aplicar a una nota vacía.';
        try {
          const { applyTemplate } =
            await import('../templates/template-engine');
          const next = applyTemplate(
            source,
            document.metadata,
            get().library.notebooks,
          );
          if (
            get().document.noteId !== document.noteId ||
            get().document.body.trim()
          )
            return 'La nota cambió mientras se preparaba la plantilla.';
          if (next.body.length > 1_000_000 || next.title.length > 512)
            return 'La plantilla supera el tamaño admitido de una nota.';
          get().updateDraft(next);
          set({ templatePickerOpen: false });
          return null;
        } catch (error) {
          return error instanceof Error
            ? error.message
            : 'No se pudo aplicar la plantilla.';
        }
      },
      async customizeTemplate(source) {
        if (get().noteList.isCreating) return;
        const epoch = generation;
        set((state) => ({ noteList: { ...state.noteList, isCreating: true } }));
        try {
          const result = await api.notes.create({
            title: source.title,
            body: source.body,
            metadata: {
              ...(source.metadata ?? defaultNoteMetadata),
              isTemplate: true,
            },
          });
          if (generation !== epoch) return;
          if (!result.ok) {
            reportFailure(result.error.code);
            return;
          }
          await get().navigate({ type: 'templates' });
          get().selectNote(result.data.id);
        } finally {
          if (generation === epoch)
            set((state) => ({
              noteList: { ...state.noteList, isCreating: false },
            }));
        }
      },
      connect(beforeFlush = () => {}) {
        connections += 1;
        if (connections === 1) {
          stopAutosave = startAutosave(store, persistence.save);
          stopClose = api.onBeforeClose(async () => {
            beforeFlush();
            await preferenceQueue;
            const stylesSaved = await get().flushThemeChanges();
            const notesSaved = await get().flushDrafts();
            return stylesSaved && notesSaved;
          });
          unsubscribe = api.onNoteChanged(onNoteChanged);
          void refreshNotes();
          const currentGeneration = generation;
          stopStyles = api.themes.onCustomStylesChanged((customStyles) =>
            set({ customStyles }),
          );
          void api.themes.list().then((result) => {
            if (generation !== currentGeneration) return;
            set({
              installedThemes: result.ok ? result.data : [],
              themesReady: true,
              themeError: result.ok ? null : result.error.code,
            });
          });
          void api.themes.getCustomStyles().then((result) => {
            if (generation === currentGeneration && result.ok)
              set({ customStyles: result.data });
          });
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
            stopStyles?.();
            stopStyles = undefined;
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
      async setSearchGlobal(searchGlobal) {
        set({
          searchGlobal,
          ...(searchGlobal ? { navigation: { type: 'all' as const } } : {}),
        });
        await refreshNotes();
      },
      togglePin() {
        if (!get().document.noteId || get().navigation.type === 'trash') return;
        get().updateDraft({ isPinned: !get().document.isPinned });
        void get().saveDraft();
      },
      setNoteStatus(status) {
        if (!get().document.noteId || get().navigation.type === 'trash') return;
        get().updateDraft({ metadata: { ...get().document.metadata, status } });
      },
      selectNote(noteId) {
        linkRequest++;
        linkedDocument = null;
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
