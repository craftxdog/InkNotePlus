import { beforeEach, describe, expect, it } from 'vitest';

import {
  initialNoteListState,
  useNoteListStore,
} from '../../src/renderer/state/note-list-store';
import type { NoteProjection } from '../../src/shared/ipc';

const olderNote: NoteProjection = {
  id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'Older',
  body: '',
  isPinned: false,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  deletedAt: null,
  revision: 1,
};

const newerNote: NoteProjection = {
  ...olderNote,
  id: '6a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'Newer',
  updatedAt: '2026-10-30T13:00:00.000Z',
};

describe('note list store', () => {
  beforeEach(() => {
    useNoteListStore.setState(initialNoteListState);
  });

  it('keeps the canonical list projection in stable updated order', () => {
    useNoteListStore.getState().replaceNotes([olderNote, newerNote]);

    expect(useNoteListStore.getState()).toMatchObject({
      notes: [newerNote, olderNote],
      status: 'ready',
      errorCode: null,
    });
  });

  it('reduces confirmed note events without duplicate list entries', () => {
    const store = useNoteListStore.getState();
    store.upsertNote(olderNote);
    store.applyNoteChanged({ type: 'restored', note: newerNote });
    store.applyNoteChanged({ type: 'created', note: newerNote });

    expect(useNoteListStore.getState().notes).toEqual([newerNote, olderNote]);
  });

  it('finishes loading after a confirmed mutation and keeps trashed notes hidden', () => {
    const store = useNoteListStore.getState();
    store.setLoading();
    store.upsertNote(newerNote);
    store.upsertNote({
      ...newerNote,
      deletedAt: '2026-10-30T14:00:00.000Z',
      revision: 2,
    });

    expect(useNoteListStore.getState()).toMatchObject({
      notes: [],
      status: 'ready',
      errorCode: null,
    });
  });

  it('removes trashed notes and preserves a safe error state', () => {
    const store = useNoteListStore.getState();
    store.replaceNotes([olderNote]);
    store.applyNoteChanged({ type: 'trashed', note: olderNote });
    store.setError('unavailable');

    expect(useNoteListStore.getState()).toMatchObject({
      notes: [],
      status: 'error',
      errorCode: 'unavailable',
    });
  });
});
