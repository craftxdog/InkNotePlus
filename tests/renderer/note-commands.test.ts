import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createNote,
  loadNotes,
  saveNote,
  searchNotes,
  subscribeToNoteChanges,
} from '../../src/renderer/commands/note-commands';
import {
  initialNoteListState,
  useNoteListStore,
} from '../../src/renderer/state/note-list-store';
import {
  initialWorkspaceState,
  useWorkspaceStore,
} from '../../src/renderer/state/workspace-store';
import type { InkNoteApi } from '../../src/preload/api';
import {
  failure,
  success,
  type NoteChangedEvent,
  type NoteProjection,
} from '../../src/shared/ipc';

const firstNote: NoteProjection = {
  id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'First',
  body: '',
  isPinned: false,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  deletedAt: null,
  revision: 1,
};

const secondNote: NoteProjection = {
  ...firstNote,
  id: '6a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'Second',
  updatedAt: '2026-10-30T13:00:00.000Z',
};

function installApi(overrides: Partial<InkNoteApi['notes']> = {}) {
  let onNoteChanged: ((event: NoteChangedEvent) => void) | null = null;
  const api: InkNoteApi = {
    notes: {
      create: async () => failure('unavailable'),
      update: async () => failure('unavailable'),
      list: async () => failure('unavailable'),
      search: async () => failure('unavailable'),
      moveToTrash: async () => failure('unavailable'),
      restore: async () => failure('unavailable'),
      ...overrides,
    },
    onNoteChanged: (listener) => {
      onNoteChanged = listener;
      return () => {
        onNoteChanged = null;
      };
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { inkNote: api },
  });
  return {
    emitNoteChanged(event: NoteChangedEvent) {
      onNoteChanged?.(event);
    },
  };
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve: resolve! };
}

describe('renderer note commands', () => {
  beforeEach(() => {
    useNoteListStore.setState(initialNoteListState);
    useWorkspaceStore.setState(initialWorkspaceState);
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('loads a projection and selects its first visible note', async () => {
    installApi({ list: async () => success([firstNote]) });

    await loadNotes();

    expect(useNoteListStore.getState()).toMatchObject({
      notes: [firstNote],
      status: 'ready',
    });
    expect(useWorkspaceStore.getState().activeNoteId).toBe(firstNote.id);
  });

  it('ignores a stale list result after a newer search', async () => {
    const listRequest =
      deferred<Awaited<ReturnType<InkNoteApi['notes']['list']>>>();
    const searchRequest =
      deferred<Awaited<ReturnType<InkNoteApi['notes']['search']>>>();
    installApi({
      list: () => listRequest.promise,
      search: () => searchRequest.promise,
    });

    const loading = loadNotes();
    const searching = searchNotes('Second');
    searchRequest.resolve(success([secondNote]));
    await searching;
    listRequest.resolve(success([firstNote]));
    await loading;

    expect(useNoteListStore.getState().notes).toEqual([secondNote]);
  });

  it('creates and selects a note through the bridge', async () => {
    installApi({ create: async () => success(secondNote) });

    await createNote();

    expect(useNoteListStore.getState().notes).toEqual([secondNote]);
    expect(useWorkspaceStore.getState().activeNoteId).toBe(secondNote.id);
  });

  it('keeps a confirmed creation when an older list finishes later', async () => {
    const listRequest =
      deferred<Awaited<ReturnType<InkNoteApi['notes']['list']>>>();
    installApi({
      create: async () => success(secondNote),
      list: () => listRequest.promise,
    });

    const loading = loadNotes();
    await createNote();
    listRequest.resolve(success([]));
    await loading;

    expect(useNoteListStore.getState().notes).toEqual([secondNote]);
    expect(useWorkspaceStore.getState().activeNoteId).toBe(secondNote.id);
    expect(useNoteListStore.getState().status).toBe('ready');
  });

  it('saves a revision-bound update and projects the confirmed result', async () => {
    const updatedNote = {
      ...firstNote,
      title: 'Updated',
      body: 'Updated body',
      revision: 2,
    };
    installApi({ update: async () => success(updatedNote) });
    useNoteListStore.getState().replaceNotes([firstNote]);

    await saveNote({
      id: firstNote.id,
      title: 'Updated',
      body: 'Updated body',
      expectedRevision: firstNote.revision,
    });

    expect(useNoteListStore.getState()).toMatchObject({
      notes: [updatedNote],
      isSaving: false,
      errorCode: null,
    });
  });

  it('refreshes an active search after a confirmed save', async () => {
    const searchQueries: string[] = [];
    installApi({
      search: async ({ query }) => {
        searchQueries.push(query);
        return success([firstNote]);
      },
      update: async () => success(secondNote),
    });
    await searchNotes('First');

    await saveNote({
      id: firstNote.id,
      title: 'Second',
      body: '',
      expectedRevision: firstNote.revision,
    });

    await vi.waitFor(() => {
      expect(searchQueries).toEqual(['First', 'First']);
    });
    expect(useNoteListStore.getState().notes).toEqual([firstNote]);
  });

  it('reduces a subscribed trash event and clears the selection', () => {
    const { emitNoteChanged } = installApi();
    useNoteListStore.getState().replaceNotes([firstNote]);
    useWorkspaceStore.getState().selectNote(firstNote.id);
    const unsubscribe = subscribeToNoteChanges();

    emitNoteChanged({ type: 'trashed', note: firstNote });
    unsubscribe();

    expect(useNoteListStore.getState().notes).toEqual([]);
    expect(useWorkspaceStore.getState().activeNoteId).toBeNull();
  });

  it('refreshes an active search instead of injecting an unrelated event', async () => {
    const searchQueries: string[] = [];
    const { emitNoteChanged } = installApi({
      search: async ({ query }) => {
        searchQueries.push(query);
        return success([firstNote]);
      },
    });
    await searchNotes('First');
    useWorkspaceStore.getState().setSearchQuery('First');
    const unsubscribe = subscribeToNoteChanges();

    emitNoteChanged({ type: 'created', note: secondNote });

    await vi.waitFor(() => {
      expect(searchQueries).toEqual(['First', 'First']);
    });
    unsubscribe();

    expect(useNoteListStore.getState().notes).toEqual([firstNote]);
  });
});
