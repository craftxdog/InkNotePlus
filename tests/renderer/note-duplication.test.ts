import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import {
  maxTitleLength,
  success,
  type NoteProjection,
} from '../../src/shared/ipc';
import {
  defaultNoteMetadata,
  type NoteMetadata,
} from '../../src/shared/note-metadata';
import { createApi, firstNote, secondNote } from '../support/renderer-api';

const metadata: NoteMetadata = {
  ...defaultNoteMetadata,
  status: 'active',
  tags: ['work'],
};
const copyId = '9a5115f8-747f-416d-82d5-d9c12e34d323';

function setup(
  notes: NoteProjection[] = [
    { ...firstNote, metadata, isPinned: true },
    secondNote,
  ],
) {
  let stored = [...notes];
  const create = vi.fn(async (input: { title: string; body: string }) => {
    const note = {
      ...firstNote,
      ...input,
      id: stored.length === notes.length ? copyId : crypto.randomUUID(),
      isPinned: false,
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    stored = [note, ...stored];
    return success(note);
  });
  const bridge = createApi({
    list: async (input = {}) =>
      success(input.id ? stored.filter(({ id }) => id === input.id) : stored),
    update: async ({ expectedRevision: _revision, ...input }) => {
      const note: NoteProjection = {
        ...stored.find(({ id }) => id === input.id)!,
        ...input,
        revision: 2,
      };
      stored = stored.map((value) => (value.id === note.id ? note : value));
      return success(note);
    },
    create,
  });
  return { store: createWorkspaceStore(bridge.api), create };
}

describe('duplicating notes', () => {
  it('copies content and metadata, opens the copy and leaves the pin behind', async () => {
    const { store, create } = setup();
    await store.getState().refreshNotes();
    store.getState().selectNote(firstNote.id);
    await expect(store.getState().duplicateNotes()).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith({
      title: 'First (copia)',
      body: 'First body',
      metadata,
    });
    expect(store.getState().activeNoteId).toBe(copyId);
    expect(store.getState().document.isPinned).toBe(false);
  });
  it('saves the open draft before copying it', async () => {
    const { store, create } = setup();
    await store.getState().refreshNotes();
    store.getState().selectNote(firstNote.id);
    store.getState().updateDraft({ body: 'Sin guardar' });
    await store.getState().duplicateNotes();
    expect(create.mock.calls[0][0].body).toBe('Sin guardar');
  });
  it('copies every selected note', async () => {
    const { store, create } = setup();
    await store.getState().refreshNotes();
    await store.getState().duplicateNotes([firstNote.id, secondNote.id]);
    expect(create.mock.calls.map(([input]) => input.title)).toEqual([
      'First (copia)',
      'Second (copia)',
    ]);
  });
  it('keeps long titles within the limit and names untitled notes', async () => {
    const { store, create } = setup([
      { ...firstNote, title: 'x'.repeat(maxTitleLength) },
      { ...secondNote, title: '' },
    ]);
    await store.getState().refreshNotes();
    await store.getState().duplicateNotes([firstNote.id, secondNote.id]);
    const [long, untitled] = create.mock.calls.map(([input]) => input.title);
    expect(long).toHaveLength(maxTitleLength);
    expect(long.endsWith(' (copia)')).toBe(true);
    expect(untitled).toBe('Nota sin título (copia)');
  });
  it('refuses to copy from Trash', async () => {
    const { store, create } = setup();
    await store.getState().navigate({ type: 'trash' });
    await expect(store.getState().duplicateNotes([firstNote.id])).resolves.toBe(
      false,
    );
    expect(create).not.toHaveBeenCalled();
  });
});
