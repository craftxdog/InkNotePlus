import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success, type NoteProjection } from '../../src/shared/ipc';
import {
  createApi,
  deferred,
  firstNote,
  secondNote,
} from '../support/renderer-api';

const thirdNote: NoteProjection = {
  ...firstNote,
  id: '7a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'Third',
  body: 'Third body',
};
const fourthNote: NoteProjection = {
  ...firstNote,
  id: '8a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'Fourth',
  body: 'Fourth body',
};
const notes = [firstNote, secondNote, thirdNote, fourthNote];

async function createHistoryWorkspace() {
  const { api } = createApi({
    list: async (input = {}) =>
      success(input.id ? notes.filter((note) => note.id === input.id) : notes),
  });
  const store = createWorkspaceStore(api);
  await store.getState().refreshNotes();
  return store;
}

describe('viewed note history', () => {
  it('records confirmed note changes in opening order without consecutive duplicates', async () => {
    const store = await createHistoryWorkspace();
    store.getState().selectNote(thirdNote.id);
    store.getState().selectNote(secondNote.id);
    store.getState().selectNote(secondNote.id);
    store.getState().updateDraft({ body: 'Still editing the same note' });

    expect(store.getState().noteHistory).toEqual({
      ids: [firstNote.id, thirdNote.id, secondNote.id],
      index: 2,
    });
  });

  it('goes back and forward through viewed notes rather than adjacent list entries', async () => {
    const store = await createHistoryWorkspace();
    store.getState().selectNote(thirdNote.id);
    store.getState().selectNote(secondNote.id);
    const listBeforeNavigation = [...store.getState().noteList.notes];

    expect(await store.getState().navigateHistory(-1)).toBe(true);
    expect(store.getState()).toMatchObject({
      activeNoteId: thirdNote.id,
      document: { noteId: thirdNote.id, body: thirdNote.body },
      noteHistory: {
        ids: [firstNote.id, thirdNote.id, secondNote.id],
        index: 1,
      },
    });
    expect(await store.getState().navigateHistory(1)).toBe(true);
    expect(store.getState()).toMatchObject({
      activeNoteId: secondNote.id,
      document: { noteId: secondNote.id, body: secondNote.body },
      noteHistory: {
        ids: [firstNote.id, thirdNote.id, secondNote.id],
        index: 2,
      },
    });
    expect(store.getState().noteList.notes).toEqual(listBeforeNavigation);
  });

  it('preserves drafts as back and forward revisit multiple edited notes', async () => {
    const store = await createHistoryWorkspace();
    store.getState().updateDraft({ body: 'Unfinished first note' });
    store.getState().selectNote(thirdNote.id);
    store.getState().updateDraft({ body: 'Unfinished third note' });
    store.getState().selectNote(secondNote.id);
    store.getState().updateDraft({ body: 'Unfinished second note' });

    await store.getState().navigateHistory(-1);
    expect(store.getState().document).toMatchObject({
      noteId: thirdNote.id,
      body: 'Unfinished third note',
    });
    await store.getState().navigateHistory(-1);
    expect(store.getState().document).toMatchObject({
      noteId: firstNote.id,
      body: 'Unfinished first note',
    });
    await store.getState().navigateHistory(1);
    await store.getState().navigateHistory(1);
    expect(store.getState().document).toMatchObject({
      noteId: secondNote.id,
      body: 'Unfinished second note',
    });
  });

  it('discards the forward branch when a different note is opened after going back', async () => {
    const store = await createHistoryWorkspace();
    store.getState().selectNote(thirdNote.id);
    store.getState().selectNote(secondNote.id);
    await store.getState().navigateHistory(-1);

    store.getState().selectNote(fourthNote.id);

    expect(store.getState().noteHistory).toEqual({
      ids: [firstNote.id, thirdNote.id, fourthNote.id],
      index: 2,
    });
    expect(await store.getState().navigateHistory(1)).toBe(false);
    expect(store.getState().activeNoteId).toBe(fourthNote.id);
    expect(await store.getState().navigateHistory(-1)).toBe(true);
    expect(store.getState().activeNoteId).toBe(thirdNote.id);
  });

  it('skips a deleted destination in both directions', async () => {
    let available = [...notes];
    const { api } = createApi({
      list: async (input = {}) =>
        success(
          input.id
            ? available.filter((note) => note.id === input.id)
            : available,
        ),
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    store.getState().selectNote(thirdNote.id);
    store.getState().selectNote(secondNote.id);
    available = available.filter((note) => note.id !== thirdNote.id);
    await store.getState().refreshNotes();

    expect(await store.getState().navigateHistory(-1)).toBe(true);
    expect(store.getState().document.noteId).toBe(firstNote.id);
    expect(await store.getState().navigateHistory(1)).toBe(true);
    expect(store.getState().document.noteId).toBe(secondNote.id);
    expect(store.getState().noteList.notes).toEqual(available);
  });

  it('returns false at either end without changing the current note or history', async () => {
    const store = await createHistoryWorkspace();
    expect(await store.getState().navigateHistory(-1)).toBe(false);
    expect(await store.getState().navigateHistory(1)).toBe(false);
    store.getState().selectNote(thirdNote.id);
    expect(await store.getState().navigateHistory(1)).toBe(false);
    expect(await store.getState().navigateHistory(-1)).toBe(true);
    expect(await store.getState().navigateHistory(-1)).toBe(false);
    expect(store.getState()).toMatchObject({
      activeNoteId: firstNote.id,
      noteHistory: { ids: [firstNote.id, thirdNote.id], index: 0 },
    });
  });

  it('records linked notes outside the loaded list and can revisit them without reordering it', async () => {
    const visibleNotes = [firstNote, secondNote];
    const { api } = createApi({
      list: async (input = {}) =>
        success(
          input.id
            ? notes.filter((note) => note.id === input.id)
            : visibleNotes,
        ),
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    await store.getState().openNoteLink(`inknote://note/${thirdNote.id}`);
    store.getState().selectNote(secondNote.id);

    expect(await store.getState().navigateHistory(-1)).toBe(true);
    expect(store.getState().document).toMatchObject({
      noteId: thirdNote.id,
      body: thirdNote.body,
    });
    expect(await store.getState().navigateHistory(1)).toBe(true);
    expect(store.getState().document.noteId).toBe(secondNote.id);
    expect(store.getState().noteList.notes).toEqual(visibleNotes);
  });

  it('ignores a delayed history response after the user manually opens another note', async () => {
    const response = deferred<ReturnType<typeof success<NoteProjection[]>>>();
    let delayHistoryLookup = false;
    let historyLookupStarted = false;
    const { api } = createApi({
      list: async (input = {}) => {
        if (input.id === thirdNote.id && delayHistoryLookup) {
          historyLookupStarted = true;
          return response.promise;
        }
        return success(
          input.id
            ? notes.filter((note) => note.id === input.id)
            : [firstNote, secondNote, fourthNote],
        );
      },
    });
    const store = createWorkspaceStore(api);
    await store.getState().refreshNotes();
    await store.getState().openNoteLink(`inknote://note/${thirdNote.id}`);
    store.getState().selectNote(secondNote.id);
    delayHistoryLookup = true;
    const navigating = store.getState().navigateHistory(-1);
    await vi.waitFor(() => expect(historyLookupStarted).toBe(true));

    store.getState().selectNote(fourthNote.id);
    response.resolve(success([thirdNote]));

    expect(await navigating).toBe(false);
    expect(store.getState()).toMatchObject({
      activeNoteId: fourthNote.id,
      document: { noteId: fourthNote.id },
      noteHistory: {
        ids: [firstNote.id, thirdNote.id, secondNote.id, fourthNote.id],
        index: 3,
      },
    });
  });
});
