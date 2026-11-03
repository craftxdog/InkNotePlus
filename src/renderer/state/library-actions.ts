import type { StoreApi } from 'zustand/vanilla';
import type { InkNoteApi } from '../../preload/api';
import type { WorkspaceStore, Navigation } from './workspace-types';
import { defaultNoteMetadata } from '../../shared/note-metadata';
import type { ListNotesInput } from '../../shared/ipc';

export function navigationFilter(navigation: Navigation): ListNotesInput {
  switch (navigation.type) {
    case 'all':
      return {};
    case 'templates':
      return { templates: true };
    case 'trash':
      return { trashed: true };
    case 'notebook':
      return { notebookId: navigation.id === 'unfiled' ? null : navigation.id };
    case 'status':
      return { status: navigation.status };
    case 'tag':
      return { tag: navigation.name };
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
  return {
    setNotebookDialogOpen(notebookDialogOpen: boolean) {
      set({ notebookDialogOpen });
    },
    async refreshLibrary() {
      const request = ++libraryRequest;
      const generation = getGeneration();
      try {
        const result = await api.library.get();
        if (generation !== getGeneration() || request !== libraryRequest)
          return;
        if (result.ok) set({ library: result.data });
        else fail();
      } catch {
        if (generation === getGeneration() && request === libraryRequest)
          fail();
      }
    },
    async navigate(navigation: Navigation) {
      set({ navigation, searchQuery: '' });
      await get().refreshNotes();
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
    async trashActiveNote() {
      const generation = getGeneration();
      const id = get().activeNoteId;
      if (!id) return;
      try {
        const result = await api.notes.moveToTrash({ id });
        if (generation !== getGeneration()) return;
        if (!result.ok) {
          fail();
          return;
        }
        await get().refreshNotes();
        await get().refreshLibrary();
      } catch {
        if (generation === getGeneration()) fail();
      }
    },
    async restoreActiveNote() {
      const generation = getGeneration();
      const id = get().activeNoteId;
      if (!id) return;
      try {
        const result = await api.notes.restore({ id });
        if (generation !== getGeneration()) return;
        if (!result.ok) {
          fail();
          return;
        }
        await get().refreshNotes();
        await get().refreshLibrary();
      } catch {
        if (generation === getGeneration()) fail();
      }
    },
  };
}

export function metadataForNewNote(navigation: Navigation) {
  return {
    ...defaultNoteMetadata,
    ...(navigation.type === 'notebook'
      ? { notebookId: navigation.id === 'unfiled' ? null : navigation.id }
      : {}),
    ...(navigation.type === 'templates' ? { isTemplate: true } : {}),
    ...(navigation.type === 'status' ? { status: navigation.status } : {}),
    ...(navigation.type === 'tag' ? { tags: [navigation.name] } : {}),
  };
}
