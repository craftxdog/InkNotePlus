import type { StoreApi } from 'zustand/vanilla';
import type { InkNoteApi } from '../../preload/api';
import type { WorkspaceStore, Navigation } from './workspace-types';
import {
  pruneNotebookPreferences,
  type Preferences,
} from '../../shared/preferences';
import type { NotebookIconName } from '../../shared/notebook-icons';
import { defaultNoteMetadata } from '../../shared/note-metadata';
import {
  failure,
  type ListNotesInput,
  type ManageTrashInput,
  type Result,
} from '../../shared/ipc';
import type { UpdateTagInput } from '../../shared/tags';
import type { NoteMetadata, Notebook } from '../../shared/library';

export function matchesNavigation(
  metadata: NoteMetadata,
  navigation: Navigation,
  preferences: Preferences,
  books: readonly Notebook[],
) {
  const belongsTo = (id: string) => {
    const seen = new Set<string>();
    let current = metadata.notebookId;
    while (current && !seen.has(current)) {
      if (current === id) return true;
      seen.add(current);
      current = books.find((book) => book.id === current)?.parentId ?? null;
    }
    return false;
  };
  if (preferences.notebookScopeId && !belongsTo(preferences.notebookScopeId))
    return false;
  switch (navigation.type) {
    case 'all':
      return true;
    case 'trash':
      return false;
    case 'templates':
      return metadata.isTemplate;
    case 'tag':
      return metadata.tags.includes(navigation.name);
    case 'status':
      return metadata.status === navigation.status;
    case 'notebook':
      return (
        !['completed', 'dropped'].includes(metadata.status) &&
        (navigation.id === 'unfiled'
          ? metadata.notebookId === null
          : preferences.expandedNotebookIds.includes(navigation.id)
            ? metadata.notebookId === navigation.id
            : belongsTo(navigation.id))
      );
  }
}

export function navigationFilter(
  navigation: Navigation,
  preferences?: Preferences,
): ListNotesInput {
  const common = {
    ...(preferences?.notebookScopeId
      ? { scopeId: preferences.notebookScopeId }
      : {}),
    sort: preferences?.noteSort,
  };
  switch (navigation.type) {
    case 'all':
      return common;
    case 'templates':
      return { ...common, templates: true };
    case 'trash':
      return { sort: common.sort, trashed: true };
    case 'notebook':
      return {
        ...common,
        excludeFinished: true,
        notebookId: navigation.id === 'unfiled' ? null : navigation.id,
        includeDescendants: !preferences?.expandedNotebookIds.includes(
          navigation.id,
        ),
      };
    case 'status':
      return { ...common, status: navigation.status };
    case 'tag':
      return { ...common, tag: navigation.name };
  }
}

export function createLibraryActions(
  api: InkNoteApi,
  set: StoreApi<WorkspaceStore>['setState'],
  get: StoreApi<WorkspaceStore>['getState'],
  getGeneration: () => number,
) {
  let libraryRequest = 0;
  const fail = () =>
    set((state) => ({
      noteList: {
        ...state.noteList,
        status: 'error',
        errorCode: 'unavailable',
      },
    }));
  async function mutate<T>(
    action: () => Promise<Result<T>>,
    after?: (data: T) => void | Promise<void>,
  ): Promise<Result<T>> {
    const generation = getGeneration();
    try {
      if (!(await get().flushDrafts())) return failure('unavailable');
      if (generation !== getGeneration()) return failure('unavailable');
      const result = await action();
      if (!result.ok || generation !== getGeneration()) return result;
      await after?.(result.data);
      await get().refreshNotes();
      return result;
    } catch {
      return failure('unavailable');
    }
  }
  return {
    setNotebookDialogOpen(
      notebookDialogOpen: boolean,
      parentId?: string | null,
    ) {
      set({
        notebookDialogOpen,
        notebookDialogParentId:
          parentId === undefined ? get().preferences.notebookScopeId : parentId,
      });
    },
    async refreshLibrary() {
      const request = ++libraryRequest;
      const generation = getGeneration();
      try {
        const state = get();
        const result = await api.library.get({
          scopeId: state.preferences.notebookScopeId,
          filter: state.searchGlobal
            ? { sort: state.preferences.noteSort }
            : navigationFilter(state.navigation, state.preferences),
          query: state.searchQuery,
          globalSearch: state.searchGlobal,
        });
        if (generation !== getGeneration() || request !== libraryRequest)
          return;
        if (result.ok)
          set((state) => ({
            library: result.data,
            ...(state.noteList.status === 'ready'
              ? {
                  noteList: {
                    ...state.noteList,
                    hasMore: state.noteList.notes.length < result.data.matching,
                  },
                }
              : {}),
          }));
        else fail();
      } catch {
        if (generation === getGeneration() && request === libraryRequest)
          fail();
      }
    },
    async navigate(navigation: Navigation) {
      set({
        navigation,
        searchQuery: '',
        searchGlobal: false,
        selectedNoteIds: [],
      });
      await get().refreshNotes();
    },
    async focusNotebook(id: string | null) {
      if (id && !get().library.notebooks.some((book) => book.id === id)) return;
      set({
        navigation: { type: 'all' },
        searchQuery: '',
        searchGlobal: false,
        selectedNoteIds: [],
      });
      const saving = get().updatePreferences({ notebookScopeId: id });
      await get().refreshNotes();
      await saving;
    },
    async toggleNotebook(id: string) {
      const expanded = get().preferences.expandedNotebookIds;
      const saving = get().updatePreferences({
        expandedNotebookIds: expanded.includes(id)
          ? expanded.filter((value) => value !== id)
          : [...expanded, id],
      });
      if (get().navigation.type === 'notebook') await get().refreshNotes();
      await saving;
    },
    async createNotebook(name: string, parentId: string | null = null) {
      const generation = getGeneration();
      const navigation = get().navigation;
      try {
        const result = await api.library.createNotebook({ name, parentId });
        if (generation !== getGeneration()) return;
        if (!result.ok) {
          fail();
          return;
        }
        set({ notebookDialogOpen: false });
        await get().refreshLibrary();
        if (generation === getGeneration() && get().navigation === navigation)
          await get().navigate({ type: 'notebook', id: result.data.id });
      } catch {
        if (generation === getGeneration()) fail();
      }
    },
    async setNotebookIcon(id: string, icon: NotebookIconName) {
      const generation = getGeneration();
      try {
        const result = await api.library.setNotebookIcon({ id, icon });
        if (generation !== getGeneration()) return;
        if (result.ok) await get().refreshLibrary();
        else fail();
      } catch {
        if (generation === getGeneration()) fail();
      }
    },
    manageTrash(input: ManageTrashInput) {
      return mutate(
        () => api.notes.manageTrash(input),
        () => {
          const state = get();
          if (
            state.activeNoteId &&
            (input.action === 'empty'
              ? state.navigation.type === 'trash'
              : input.ids.includes(state.activeNoteId))
          )
            state.selectNote(null);
          else set({ selectedNoteIds: [] });
        },
      );
    },
    deleteNotebook(id: string) {
      return mutate(
        () => api.library.deleteNotebook(id),
        async (ids) => {
          const deleted = new Set(ids);
          const { navigation, preferences } = get();
          const activeBook = get().document.metadata.notebookId;
          if (activeBook && deleted.has(activeBook)) get().selectNote(null);
          const patch = pruneNotebookPreferences(preferences, (bookId) =>
            deleted.has(bookId),
          );
          if (
            patch.notebookScopeId === null ||
            (navigation.type === 'notebook' && deleted.has(navigation.id))
          ) {
            set({
              navigation: { type: 'all' },
              searchQuery: '',
              searchGlobal: false,
              selectedNoteIds: [],
            });
          }
          if (Object.keys(patch).length) await get().updatePreferences(patch);
        },
      );
    },
    updateTag(input: UpdateTagInput) {
      return mutate(
        () => api.library.updateTag(input),
        () => {
          const { navigation } = get();
          if (navigation.type === 'tag' && navigation.name === input.name)
            set({ navigation: { type: 'tag', name: input.nextName } });
        },
      );
    },
    deleteTag(name: string) {
      return mutate(
        () => api.library.deleteTag(name),
        () => {
          const { navigation } = get();
          if (navigation.type === 'tag' && navigation.name === name)
            set({
              navigation: { type: 'all' },
              searchQuery: '',
              searchGlobal: false,
              selectedNoteIds: [],
            });
        },
      );
    },
  };
}

export function metadataForNewNote(
  navigation: Navigation,
  preferences?: Preferences,
) {
  return {
    ...defaultNoteMetadata,
    notebookId:
      preferences?.notebookScopeId ?? preferences?.defaultNotebookId ?? null,
    ...(navigation.type === 'notebook'
      ? { notebookId: navigation.id === 'unfiled' ? null : navigation.id }
      : {}),
    ...(navigation.type === 'templates' ? { isTemplate: true } : {}),
    ...(navigation.type === 'status' ? { status: navigation.status } : {}),
    ...(navigation.type === 'tag' ? { tags: [navigation.name] } : {}),
  };
}
