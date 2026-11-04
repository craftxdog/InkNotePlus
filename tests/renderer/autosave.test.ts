import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success, failure, type NoteProjection } from '../../src/shared/ipc';
import {
  createApi,
  firstNote,
  secondNote,
  deferred,
} from '../support/renderer-api';

afterEach(() => vi.useRealTimers());
describe('automatic note persistence', () => {
  it('saves during continuous typing without writing on every keystroke', async () => {
    vi.useFakeTimers();
    let count = 0;
    const bridge = createApi({
      list: async () => success([firstNote]),
      update: async (input) => {
        count++;
        return success({
          ...firstNote,
          ...input,
          revision: input.expectedRevision + 1,
        });
      },
    });
    const store = createWorkspaceStore(bridge.api),
      stop = store.getState().connect();
    await store.getState().refreshNotes();
    for (let i = 0; i < 25; i++) {
      store.getState().updateDraft({ body: `typing ${i}` });
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(4);
    await vi.advanceTimersByTimeAsync(700);
    expect(store.getState().document).toMatchObject({
      body: 'typing 24',
      isDirty: false,
    });
    stop();
  });
  it('coalesces text and metadata edits, including a parked draft', async () => {
    vi.useFakeTimers();
    const saved: NoteProjection[] = [];
    const bridge = createApi({
      list: async () => success([firstNote, secondNote]),
      update: async (input) => {
        const note = {
          ...firstNote,
          ...input,
          revision: input.expectedRevision + 1,
        };
        saved.push(note);
        return success(note);
      },
    });
    const store = createWorkspaceStore(bridge.api);
    const stop = store.getState().connect();
    await store.getState().refreshNotes();
    store.getState().selectNote(firstNote.id);
    store.getState().updateDraft({
      title: 'Automatic',
      body: '- [ ] task',
      metadata: {
        notebookId: null,
        status: 'onhold',
        tags: ['work'],
        isTemplate: false,
      },
    });
    store.getState().selectNote(secondNote.id);
    await vi.advanceTimersByTimeAsync(700);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: firstNote.id,
      title: 'Automatic',
      body: '- [ ] task',
      metadata: { status: 'onhold', tags: ['work'] },
    });
    expect(store.getState().document.noteId).toBe(secondNote.id);
    stop();
  });
  it('flushes newer edits made during an in-flight save before reporting success', async () => {
    const pending = deferred<ReturnType<typeof success<NoteProjection>>>();
    let calls = 0;
    const bridge = createApi({
      list: async () => success([firstNote]),
      update: async (input) => {
        calls++;
        return calls === 1
          ? pending.promise
          : success({
              ...firstNote,
              ...input,
              revision: input.expectedRevision + 1,
            });
      },
    });
    const store = createWorkspaceStore(bridge.api);
    await store.getState().refreshNotes();
    store.getState().updateDraft({ body: 'first' });
    const saving = store.getState().saveDraft();
    store.getState().updateDraft({ body: 'latest' });
    const flush = store.getState().flushDrafts();
    pending.resolve(success({ ...firstNote, body: 'first', revision: 2 }));
    await saving;
    expect(await flush).toBe(true);
    expect(store.getState().document).toMatchObject({
      body: 'latest',
      revision: 3,
      isDirty: false,
    });
  });
  it('preserves drafts and reports failure instead of confirming a failed close flush', async () => {
    const bridge = createApi({
      list: async () => success([firstNote]),
      update: async () => failure('conflict'),
    });
    const store = createWorkspaceStore(bridge.api);
    await store.getState().refreshNotes();
    store.getState().updateDraft({ body: 'keep me' });
    expect(await store.getState().flushDrafts()).toBe(false);
    expect(store.getState().document).toMatchObject({
      body: 'keep me',
      isDirty: true,
    });
  });
});
