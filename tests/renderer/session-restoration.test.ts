// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceStore,
  type WorkspaceStoreApi,
} from '../../src/renderer/state/workspace-store';
import {
  readWorkspaceSession,
  writeWorkspaceSession,
  type WorkspaceSession,
} from '../../src/renderer/state/workspace-session';
import {
  failure,
  success,
  type ListNotesInput,
  type NoteProjection,
} from '../../src/shared/ipc';
import { defaultNoteMetadata, emptyLibrary } from '../../src/shared/library';
import {
  createApi,
  deferred,
  firstNote,
  secondNote,
} from '../support/renderer-api';

const notebookId = '7a5115f8-747f-416d-82d5-d9c12e34d323';
const notebook = {
  id: notebookId,
  name: 'Work',
  parentId: null,
  count: 2,
  descendantCount: 2,
  icon: 'book-open' as const,
};
const notebookNotes = [firstNote, secondNote].map((note) => ({
  ...note,
  metadata: { ...defaultNoteMetadata, notebookId },
}));
const disconnects: (() => void)[] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  for (const disconnect of disconnects.splice(0)) disconnect();
});

async function startWorkspace(
  api: Parameters<typeof createWorkspaceStore>[0],
  session?: WorkspaceSession,
) {
  const store = createWorkspaceStore(api, session);
  const disconnect = store.getState().connect();
  disconnects.push(disconnect);
  await vi.waitFor(() => {
    expect(store.getState().styleNonce).not.toBeNull();
    expect(store.getState().noteList.status).toBe('ready');
  });
  return { store, disconnect };
}

function sessionForReload(store: WorkspaceStoreApi): WorkspaceSession {
  writeWorkspaceSession(sessionStorage, store.getState());
  const session = readWorkspaceSession(sessionStorage);
  expect(session).toBeDefined();
  return session!;
}

function expectSecondNote(store: WorkspaceStoreApi) {
  expect(store.getState()).toMatchObject({
    activeNoteId: secondNote.id,
    document: {
      noteId: secondNote.id,
      title: secondNote.title,
      body: secondNote.body,
      isDirty: false,
    },
  });
}

describe('renderer reload session restoration', () => {
  it('keeps note history across reload without duplicating note content in session storage', async () => {
    const { api } = createApi({
      list: async () => success([firstNote, secondNote]),
    });
    const initial = await startWorkspace(api);
    initial.store.getState().selectNote(secondNote.id);
    const session = sessionForReload(initial.store);
    expect(session.noteHistory).toEqual({
      ids: [firstNote.id, secondNote.id],
      index: 1,
    });
    const raw = sessionStorage.getItem('inknote.workspace-session')!;
    expect(raw).not.toContain(firstNote.body);
    expect(raw).not.toContain(secondNote.body);
    initial.disconnect();
    const reloaded = await startWorkspace(api, session);
    expect(await reloaded.store.getState().navigateHistory(-1)).toBe(true);
    expect(reloaded.store.getState().activeNoteId).toBe(firstNote.id);
  });

  it('ignores corrupt or out-of-range history snapshots', async () => {
    const { api } = createApi({ list: async () => success([firstNote]) });
    const initial = await startWorkspace(api);
    const valid = sessionForReload(initial.store);
    sessionStorage.setItem('inknote.workspace-session', '{bad json');
    expect(readWorkspaceSession(sessionStorage)).toBeUndefined();
    sessionStorage.setItem(
      'inknote.workspace-session',
      JSON.stringify({
        ...valid,
        noteHistory: { ids: [firstNote.id], index: 2 },
      }),
    );
    expect(readWorkspaceSession(sessionStorage)).toBeUndefined();
    sessionStorage.setItem('inknote.workspace-session', 'x'.repeat(12001));
    expect(readWorkspaceSession(sessionStorage)).toBeUndefined();
  });

  it('restores the selected note instead of selecting the first note on a new renderer', async () => {
    const { api } = createApi({
      list: async () => success([firstNote, secondNote]),
    });
    const initial = await startWorkspace(api);
    initial.store.getState().selectNote(secondNote.id);
    expectSecondNote(initial.store);
    const session = sessionForReload(initial.store);
    initial.disconnect();

    const reloaded = await startWorkspace(api, session);

    expectSecondNote(reloaded.store);
  });

  it('restores the notebook and its search filter together with the selected note', async () => {
    const { api } = createApi({
      list: async () => success(notebookNotes),
      search: async (input) =>
        success(
          input.notebookId === notebookId && input.query === 'body'
            ? notebookNotes
            : [],
        ),
    });
    api.library.get = async () =>
      success({ ...emptyLibrary, notebooks: [notebook], matching: 2 });
    const initial = await startWorkspace(api);
    await initial.store
      .getState()
      .navigate({ type: 'notebook', id: notebookId });
    await initial.store.getState().setSearchQuery('body');
    initial.store.getState().selectNote(secondNote.id);
    expectSecondNote(initial.store);
    const session = sessionForReload(initial.store);
    initial.disconnect();

    const reloaded = await startWorkspace(api, session);

    expect(reloaded.store.getState()).toMatchObject({
      navigation: { type: 'notebook', id: notebookId },
      searchQuery: 'body',
      searchGlobal: false,
    });
    expectSecondNote(reloaded.store);
    expect(reloaded.store.getState().noteList.notes).toEqual(notebookNotes);
  });

  it('restores global search without silently turning it into a local search', async () => {
    const { api } = createApi({
      list: async () => success([firstNote, secondNote]),
      search: async (input) =>
        success(input.query === 'body' ? [firstNote, secondNote] : []),
    });
    const initial = await startWorkspace(api);
    await initial.store.getState().setSearchGlobal(true);
    await initial.store.getState().setSearchQuery('body');
    initial.store.getState().selectNote(secondNote.id);
    expectSecondNote(initial.store);
    const session = sessionForReload(initial.store);
    initial.disconnect();

    const reloaded = await startWorkspace(api, session);

    expect(reloaded.store.getState()).toMatchObject({
      searchQuery: 'body',
      searchGlobal: true,
      navigation: { type: 'all' },
    });
    expectSecondNote(reloaded.store);
  });

  it('keeps the selected note within the persisted notebook scope', async () => {
    const { api } = createApi({
      list: async (input = {}) =>
        success(input.scopeId === notebookId ? notebookNotes : [firstNote]),
    });
    api.library.get = async () =>
      success({ ...emptyLibrary, notebooks: [notebook], matching: 2 });
    const initial = await startWorkspace(api);
    await initial.store.getState().focusNotebook(notebookId);
    initial.store.getState().selectNote(secondNote.id);
    expectSecondNote(initial.store);
    const session = sessionForReload(initial.store);
    initial.disconnect();

    const reloaded = await startWorkspace(api, session);

    expect(reloaded.store.getState().preferences.notebookScopeId).toBe(
      notebookId,
    );
    expectSecondNote(reloaded.store);
    expect(reloaded.store.getState().noteList.notes).toEqual(notebookNotes);
  });

  it('falls back to an available note when the previous note no longer exists', async () => {
    let notes = [firstNote, secondNote];
    const { api } = createApi({ list: async () => success(notes) });
    const initial = await startWorkspace(api);
    initial.store.getState().selectNote(secondNote.id);
    const session = sessionForReload(initial.store);
    initial.disconnect();
    notes = [firstNote];

    const reloaded = await startWorkspace(api, session);

    expect(reloaded.store.getState()).toMatchObject({
      activeNoteId: firstNote.id,
      document: { noteId: firstNote.id, body: firstNote.body },
      noteList: { status: 'ready' },
    });
  });

  it('falls back within the restored notebook if the previous note was moved elsewhere', async () => {
    let notes: NoteProjection[] = notebookNotes;
    const { api } = createApi({
      list: async (input = {}) =>
        success(
          notes.filter(
            (note) =>
              (!input.id || note.id === input.id) &&
              (input.notebookId === undefined ||
                note.metadata?.notebookId === input.notebookId),
          ),
        ),
    });
    api.library.get = async () =>
      success({ ...emptyLibrary, notebooks: [notebook], matching: 1 });
    const initial = await startWorkspace(api);
    await initial.store
      .getState()
      .navigate({ type: 'notebook', id: notebookId });
    initial.store.getState().selectNote(secondNote.id);
    const session = sessionForReload(initial.store);
    initial.disconnect();
    notes = [
      notebookNotes[0],
      { ...notebookNotes[1], metadata: defaultNoteMetadata },
    ];

    const reloaded = await startWorkspace(api, session);

    expect(reloaded.store.getState()).toMatchObject({
      navigation: { type: 'notebook', id: notebookId },
      activeNoteId: firstNote.id,
      document: { noteId: firstNote.id },
    });
    expect(reloaded.store.getState().noteList.notes).toEqual([
      notebookNotes[0],
    ]);
  });

  it('restores sidebar visibility and distraction-free layout', async () => {
    const { api } = createApi({ list: async () => success([firstNote]) });
    const initial = await startWorkspace(api);
    initial.store.getState().setSidebarVisible(false);
    initial.store.getState().setDistractionFreeEnabled(true);
    const session = sessionForReload(initial.store);
    initial.disconnect();

    const reloaded = await startWorkspace(api, session);

    expect(reloaded.store.getState().mainLayout).toEqual({
      sidebarVisible: false,
      distractionFreeEnabled: true,
    });
  });

  it('restores the selected note even when it is outside the first page', async () => {
    const notes = [
      firstNote,
      ...Array.from({ length: 73 }, (_, index) => ({
        ...firstNote,
        id: `8a5115f8-747f-416d-82d5-${String(index).padStart(12, '0')}`,
      })),
      secondNote,
    ];
    const { api } = createApi({
      list: async (input = {}) =>
        success(
          input.id
            ? notes.filter((note) => note.id === input.id)
            : notes.slice(
                input.offset ?? 0,
                (input.offset ?? 0) + (input.limit ?? 50),
              ),
        ),
    });
    api.library.get = async () =>
      success({ ...emptyLibrary, matching: notes.length });
    const initial = await startWorkspace(api);
    await initial.store.getState().loadMoreNotes();
    initial.store.getState().selectNote(secondNote.id);
    expectSecondNote(initial.store);
    const session = sessionForReload(initial.store);
    initial.disconnect();

    const reloaded = await startWorkspace(api, session);

    expectSecondNote(reloaded.store);
  });

  it('keeps the restoration target for retry after a database read failure', async () => {
    const { api } = createApi({
      list: async () => success([firstNote, secondNote]),
    });
    const initial = await startWorkspace(api);
    initial.store.getState().selectNote(secondNote.id);
    const session = sessionForReload(initial.store);
    initial.disconnect();
    let unavailable = true;
    api.notes.list = async (input = {}) =>
      input.id
        ? unavailable
          ? failure('unavailable')
          : success([secondNote])
        : success([firstNote]);
    const reloaded = createWorkspaceStore(api, session);
    disconnects.push(reloaded.getState().connect());
    await vi.waitFor(() =>
      expect(reloaded.getState().noteList.status).toBe('error'),
    );
    expect(reloaded.getState().activeNoteId).toBe(secondNote.id);
    unavailable = false;
    await reloaded.getState().refreshNotes();
    expectSecondNote(reloaded);
  });

  it('waits for persisted preferences before loading the restored notebook scope', async () => {
    const queries: ListNotesInput[] = [];
    const { api } = createApi({
      list: async (input = {}) => {
        queries.push(input);
        return success(
          input.scopeId === notebookId ? notebookNotes : [firstNote],
        );
      },
    });
    api.library.get = async () =>
      success({ ...emptyLibrary, notebooks: [notebook], matching: 2 });
    const initial = await startWorkspace(api);
    await initial.store.getState().focusNotebook(notebookId);
    initial.store.getState().selectNote(secondNote.id);
    const session = sessionForReload(initial.store);
    initial.disconnect();
    const confirmedPreferences = await api.preferences.get();
    const bootstrap = deferred<typeof confirmedPreferences>();
    api.preferences.get = () => bootstrap.promise;
    queries.length = 0;

    const reloaded = createWorkspaceStore(api, session);
    disconnects.push(reloaded.getState().connect());
    try {
      expect([...queries]).toEqual([]);
    } finally {
      bootstrap.resolve(confirmedPreferences);
    }
    await vi.waitFor(() =>
      expect(reloaded.getState().noteList.status).toBe('ready'),
    );

    expect(queries.every((query) => query.scopeId === notebookId)).toBe(true);
    expectSecondNote(reloaded);
  });
});
