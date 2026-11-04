import { expect, it } from 'vitest';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi, firstNote } from '../support/renderer-api';
import { success, failure } from '../../src/shared/ipc';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';
import { emptyLibrary } from '../../src/shared/library';

it('refreshes page boundaries after external changes and loads every note exactly once', async () => {
  const dataset = Array.from({ length: 105 }, (_, index) => ({
    ...firstNote,
    id: `note-${index}`,
    title: String(index),
    isPinned: true,
    updatedAt: new Date(2026, 0, 1, 0, index).toISOString(),
  })).reverse();
  const bridge = createApi({
    list: async (input = {}) =>
      success(
        dataset.slice(
          input.offset ?? 0,
          (input.offset ?? 0) + (input.limit ?? 50),
        ),
      ),
  });
  bridge.api.library.get = async () =>
    success({ ...emptyLibrary, matching: dataset.length });
  const store = createWorkspaceStore(bridge.api);
  const stop = store.getState().connect();
  await store.getState().refreshNotes();
  await store.getState().loadMoreNotes();
  const oldest = dataset.pop()!;
  dataset.push({
    ...oldest,
    isPinned: false,
    updatedAt: new Date(2027, 0, 1).toISOString(),
    revision: 2,
  });
  bridge.emitNoteChanged({
    type: 'updated',
    note: dataset[dataset.length - 1],
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await store.getState().loadMoreNotes();
  expect(store.getState().noteList.notes.map((note) => note.id)).toEqual(
    dataset.map((note) => note.id),
  );
  stop();
});

it('removes an externally moved note from its old filtered context', async () => {
  let visible = true;
  const bridge = createApi({
    list: async () =>
      success(visible ? [{ ...firstNote, metadata: defaultNoteMetadata }] : []),
  });
  const store = createWorkspaceStore(bridge.api);
  const stop = store.getState().connect();
  await store.getState().navigate({ type: 'status', status: 'active' });
  visible = false;
  bridge.emitNoteChanged({
    type: 'updated',
    note: {
      ...firstNote,
      metadata: { ...defaultNoteMetadata, status: 'completed' },
      revision: 2,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.getState().activeNoteId).toBeNull();
  stop();
});

it('reloads the confirmed scope after a preference write fails', async () => {
  const bookId = '6a5115f8-747f-416d-82d5-d9c12e34d323';
  const bridge = createApi({
    list: async (input = {}) => success(input.scopeId ? [] : [firstNote]),
  });
  bridge.api.library.get = async () =>
    success({
      ...emptyLibrary,
      notebooks: [
        {
          id: bookId,
          name: 'Scope',
          parentId: null,
          count: 0,
          descendantCount: 0,
          icon: 'book-open',
        },
      ],
    });
  bridge.api.preferences.update = async () => failure('unavailable');
  const store = createWorkspaceStore(bridge.api);
  const stop = store.getState().connect();
  await store.getState().refreshNotes();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await store.getState().focusNotebook(bookId);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.getState().preferences.notebookScopeId).toBeNull();
  expect(store.getState().noteList.notes).toEqual([firstNote]);
  stop();
});
