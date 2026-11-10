import { describe, expect, it } from 'vitest';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { resolveMainLayout } from '../../src/renderer/layout/inkdrop-main-layout';
import { failure, success, type NoteProjection } from '../../src/shared/ipc';
import {
  createApi,
  deferred,
  firstNote,
  secondNote,
} from '../support/renderer-api';

describe('workspace Zustand store', () => {
  it('leaves Trash when starting a global search so live results stay editable', async () => {
    const bridge = createApi({
      list: async () => success([firstNote]),
      search: async () => success([firstNote]),
    });
    const store = createWorkspaceStore(bridge.api);
    await store.getState().navigate({ type: 'trash' });
    await store.getState().setSearchGlobal(true);
    await store.getState().setSearchQuery('First');
    expect(store.getState().navigation).toEqual({ type: 'all' });
    expect(store.getState().document.noteId).toBe(firstNote.id);
    store.getState().setNoteStatus('active');
    expect(store.getState().document.metadata.status).toBe('active');
  });
  it('refreshes a filtered section when saving metadata moves a note out of it', async () => {
    let note = {
      ...firstNote,
      metadata: {
        notebookId: null,
        status: 'active' as 'active' | 'completed',
        tags: [],
        isTemplate: false,
      },
    };
    const bridge = createApi({
      list: async (input) =>
        success(
          !input?.status || input.status === note.metadata.status ? [note] : [],
        ),
      update: async (input) => {
        note = {
          ...note,
          ...input,
          metadata: input.metadata as typeof note.metadata,
          revision: note.revision + 1,
        };
        return success(note);
      },
    });
    const store = createWorkspaceStore(bridge.api);
    await store.getState().navigate({ type: 'status', status: 'active' });
    store
      .getState()
      .updateDraft({ metadata: { ...note.metadata, status: 'completed' } });
    expect(store.getState().document.isDirty).toBe(true);
    await store.getState().saveDraft();
    expect(store.getState().noteList.notes).toEqual([]);
    expect(store.getState().activeNoteId).toBeNull();
    await store.getState().navigate({ type: 'status', status: 'completed' });
    expect(store.getState().document.metadata.status).toBe('completed');
    expect(store.getState().document.isDirty).toBe(false);
  });

  it('ignores a library response after disconnect', async () => {
    const response =
      deferred<
        Awaited<
          ReturnType<ReturnType<typeof createApi>['api']['library']['get']>
        >
      >();
    const bridge = createApi({ list: async () => success([]) });
    bridge.api.library.get = () => response.promise;
    const store = createWorkspaceStore(bridge.api);
    const disconnect = store.getState().connect();
    const pending = store.getState().refreshLibrary();
    disconnect();
    response.resolve(success({ ...store.getState().library, total: 123 }));
    await pending;
    expect(store.getState().library.total).toBe(0);
  });
  it('loads notes, selection and document as one consistent update', async () => {
    const { api } = createApi({ list: async () => success([firstNote]) });
    const store = createWorkspaceStore(api);
    const observed: boolean[] = [];
    store.subscribe((state) => {
      if (state.noteList.status === 'ready')
        observed.push(state.activeNoteId === state.document.noteId);
    });
    await store.getState().refreshNotes();
    expect(store.getState()).toMatchObject({
      activeNoteId: firstNote.id,
      noteList: { notes: [firstNote], status: 'ready' },
      document: { noteId: firstNote.id, body: firstNote.body, isDirty: false },
    });
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every(Boolean)).toBe(true);
  });

  it('opens a linked note outside the loaded page and preserves the current draft', async () => {
    const { api } = createApi({
      list: async (input) =>
        success(input?.id === secondNote.id ? [secondNote] : [firstNote]),
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    store.getState().updateDraft({ body: 'Draft before following link' });
    expect(
      await store.getState().openNoteLink(`inknote://note/${secondNote.id}`),
    ).toEqual(success(true));
    await store.getState().refreshNotes();
    expect(store.getState().document.noteId).toBe(secondNote.id);
    expect(store.getState().noteList.notes.map(({ id }) => id)).toEqual([
      firstNote.id,
    ]);
    store.getState().selectNote(firstNote.id);
    expect(store.getState().document.body).toBe('Draft before following link');
  });

  it('discards a linked-note response after the user selects another note', async () => {
    const response = deferred<ReturnType<typeof success<NoteProjection[]>>>();
    const { api } = createApi({
      list: (input) =>
        input?.id ? response.promise : Promise.resolve(success([firstNote])),
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    const opening = store
      .getState()
      .openNoteLink(`inknote://note/${secondNote.id}`);
    store.getState().selectNote(firstNote.id);
    response.resolve(success([secondNote]));
    expect(await opening).toEqual(success(false));
    expect(store.getState().document.noteId).toBe(firstNote.id);
  });

  it('ignores an older query that resolves after a newer search', async () => {
    const list = deferred<ReturnType<typeof success<NoteProjection[]>>>();
    const search = deferred<ReturnType<typeof success<NoteProjection[]>>>();
    const { api } = createApi({
      list: () => list.promise,
      search: () => search.promise,
    });
    const store = createWorkspaceStore(api);
    const loading = store.getState().refreshNotes();
    const searching = store.getState().setSearchQuery('Second');
    search.resolve(success([secondNote]));
    await searching;
    list.resolve(success([firstNote]));
    await loading;
    expect(store.getState().noteList.notes).toEqual([secondNote]);
    expect(store.getState().activeNoteId).toBe(secondNote.id);
  });

  it('saves only confirmed data and preserves edits made while saving', async () => {
    const saving = deferred<ReturnType<typeof success<NoteProjection>>>();
    const { api } = createApi({
      list: async () => success([firstNote]),
      update: () => saving.promise,
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    store.getState().updateDraft({ body: 'Saved body' });
    const pending = store.getState().saveDraft();
    store.getState().updateDraft({ body: 'Newer local edit' });
    saving.resolve(success({ ...firstNote, body: 'Saved body', revision: 2 }));
    await pending;
    expect(store.getState().noteList.notes[0].body).toBe('Saved body');
    expect(store.getState().document).toMatchObject({
      body: 'Newer local edit',
      revision: 2,
      isDirty: true,
    });
  });

  it('keeps unsaved text when switching notes and restores its draft', async () => {
    const { api } = createApi({
      list: async () => success([firstNote, secondNote]),
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    store.getState().selectNote(firstNote.id);
    store.getState().updateDraft({ body: 'Unsaved text' });
    store.getState().selectNote(secondNote.id);
    store.getState().selectNote(firstNote.id);
    expect(store.getState().document).toMatchObject({
      body: 'Unsaved text',
      isDirty: true,
    });
  });

  it('keeps failures safe and preserves an unsaved document', async () => {
    const { api } = createApi({
      list: async () => success([firstNote]),
      update: async () => failure('conflict'),
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    store.getState().updateDraft({ title: 'Edited' });
    await store.getState().saveDraft();
    expect(store.getState().noteList).toMatchObject({
      errorCode: 'conflict',
      isSaving: false,
    });
    expect(store.getState().document).toMatchObject({
      title: 'Edited',
      isDirty: true,
    });
  });

  it('handles bridge rejection without throwing into the UI', async () => {
    const { api } = createApi({
      list: async () => {
        throw new Error('unavailable');
      },
    });
    const store = createWorkspaceStore(api);
    await expect(store.getState().refreshNotes()).resolves.toBeUndefined();
    expect(store.getState().noteList).toMatchObject({
      status: 'error',
      errorCode: 'unavailable',
    });
  });

  it('connects and disconnects IPC subscriptions across React remounts', async () => {
    const bridge = createApi({ list: async () => success([firstNote]) });
    const store = createWorkspaceStore(bridge.api);
    const stop = store.getState().connect();
    await store.getState().refreshNotes();
    expect(bridge.listenerCount).toBe(1);
    bridge.emitNoteChanged({ type: 'created', note: secondNote });
    bridge.emitNoteChanged({ type: 'updated', note: secondNote });
    expect(store.getState().noteList.notes).toEqual([secondNote, firstNote]);
    stop();
    expect(bridge.listenerCount).toBe(0);
    const stopAgain = store.getState().connect();
    expect(bridge.listenerCount).toBe(1);
    stopAgain();
  });

  it('keeps named layouts as explicit state', () => {
    const store = createWorkspaceStore(createApi().api);
    expect(resolveMainLayout(store.getState().mainLayout)).toBe('main:full');
    store.getState().setSidebarVisible(false);
    expect(resolveMainLayout(store.getState().mainLayout)).toBe('main:slim');
    store.getState().setDistractionFreeEnabled(true);
    expect(resolveMainLayout(store.getState().mainLayout)).toBe(
      'main:distraction-free',
    );
  });

  it('creates a confirmed note, clears the filter and selects the new note', async () => {
    const { api } = createApi({
      list: async () => success([firstNote, secondNote]),
      search: async () => success([firstNote]),
      create: async () => success(secondNote),
    });
    const store = createWorkspaceStore(api);
    await store.getState().setSearchQuery('First');
    await store.getState().createNote();
    expect(store.getState()).toMatchObject({
      searchQuery: '',
      activeNoteId: secondNote.id,
      document: { noteId: secondNote.id, isDirty: false },
      noteList: { isCreating: false, status: 'ready' },
    });
  });

  it('keeps the selected note when another document finishes saving', async () => {
    const saving = deferred<ReturnType<typeof success<NoteProjection>>>();
    const { api } = createApi({
      list: async () => success([firstNote, secondNote]),
      update: () => saving.promise,
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    store.getState().selectNote(firstNote.id);
    store.getState().updateDraft({ body: 'Saved first' });
    const pending = store.getState().saveDraft();
    store.getState().selectNote(secondNote.id);
    saving.resolve(success({ ...firstNote, body: 'Saved first', revision: 2 }));
    await pending;
    expect(store.getState().document).toMatchObject({
      noteId: secondNote.id,
      body: secondNote.body,
    });
    store.getState().selectNote(firstNote.id);
    expect(store.getState().document).toMatchObject({
      body: 'Saved first',
      revision: 2,
      isDirty: false,
    });
  });

  it('ignores results belonging to a disconnected React lifecycle', async () => {
    const result = deferred<ReturnType<typeof success<NoteProjection[]>>>();
    const bridge = createApi({ list: () => result.promise });
    const store = createWorkspaceStore(bridge.api);
    const disconnect = store.getState().connect();
    const pending = store.getState().refreshNotes();
    disconnect();
    result.resolve(success([firstNote]));
    await pending;
    expect(store.getState().noteList.notes).toEqual([]);
    expect(bridge.listenerCount).toBe(0);
  });

  it('does not overwrite confirmed data with an older IPC revision', async () => {
    const newer = { ...firstNote, body: 'Newer', revision: 3 };
    const bridge = createApi({ list: async () => success([newer]) });
    const store = createWorkspaceStore(bridge.api);
    const disconnect = store.getState().connect();
    await store.getState().refreshNotes();
    bridge.emitNoteChanged({ type: 'updated', note: firstNote });
    expect(store.getState().document.body).toBe('Newer');
    disconnect();
  });
});
