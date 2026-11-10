import { describe, expect, it } from 'vitest';

import {
  IPC_CHANNELS,
  createNoteInputSchema,
  failure,
  listNotesInputSchema,
  noteChangedEventSchema,
  noteIdInputSchema,
  noteSchema,
  searchNotesInputSchema,
  success,
  updateNoteInputSchema,
} from '../../src/shared/ipc';

describe('shared IPC contract', () => {
  it('uses a fixed allowlist of note channels', () => {
    expect(IPC_CHANNELS).toEqual({
      notes: {
        create: 'notes:create',
        update: 'notes:update',
        list: 'notes:list',
        search: 'notes:search',
        moveToTrash: 'notes:move-to-trash',
        restore: 'notes:restore',
        manageTrash: 'notes:manage-trash',
      },
      events: {
        noteChanged: 'notes:changed',
      },
    });
  });

  it('preserves valid note creation text and rejects unexpected fields', () => {
    expect(
      createNoteInputSchema.parse({
        title: '  Architecture  ',
        body: 'SQLite lives in the main process.',
      }),
    ).toEqual({
      title: '  Architecture  ',
      body: 'SQLite lives in the main process.',
    });

    expect(
      createNoteInputSchema.safeParse({
        title: 'Inbox',
        body: '',
        unsafe: true,
      }).success,
    ).toBe(false);
  });

  it('bounds list and search inputs before they reach the main process', () => {
    expect(listNotesInputSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listNotesInputSchema.safeParse({ limit: 1.5 }).success).toBe(false);
    expect(searchNotesInputSchema.safeParse({ query: '   ' }).success).toBe(
      false,
    );
    expect(
      searchNotesInputSchema.parse({ query: '  IPC * OR  ', limit: 10 }),
    ).toEqual({ query: 'IPC * OR', limit: 10 });
  });

  it('accepts only UUID note identifiers', () => {
    expect(noteIdInputSchema.safeParse({ id: 'not-a-note-id' }).success).toBe(
      false,
    );
    expect(
      noteIdInputSchema.safeParse({
        id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
      }).success,
    ).toBe(true);
  });

  it('requires an expected revision before updating a note', () => {
    expect(
      updateNoteInputSchema.parse({
        id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
        title: '  Updated  ',
        body: 'New content',
        expectedRevision: 2,
      }),
    ).toEqual({
      id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
      title: '  Updated  ',
      body: 'New content',
      expectedRevision: 2,
    });
    expect(
      updateNoteInputSchema.safeParse({
        id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
        title: 'Updated',
        body: 'New content',
        expectedRevision: 0,
      }).success,
    ).toBe(false);
  });

  it('validates the note projection emitted across IPC', () => {
    expect(
      noteSchema.safeParse({
        id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
        title: 'Inbox',
        body: '',
        isPinned: false,
        createdAt: '2026-10-30T12:00:00.000Z',
        updatedAt: '2026-10-30T12:00:00.000Z',
        deletedAt: null,
        revision: 1,
      }).success,
    ).toBe(true);
  });

  it('accepts only typed note-change events', () => {
    const note = {
      id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
      title: 'Inbox',
      body: '',
      isPinned: false,
      createdAt: '2026-10-30T12:00:00.000Z',
      updatedAt: '2026-10-30T12:00:00.000Z',
      deletedAt: null,
      revision: 1,
    };

    expect(
      noteChangedEventSchema.safeParse({ type: 'updated', note }).success,
    ).toBe(true);
    expect(
      noteChangedEventSchema.safeParse({ type: 'deleted', note }).success,
    ).toBe(false);
  });

  it('uses structured, non-sensitive error results', () => {
    expect(success({ id: 'note-1' })).toEqual({
      ok: true,
      data: { id: 'note-1' },
    });
    expect(failure('unavailable')).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    });
  });
});
