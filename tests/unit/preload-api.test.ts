import type { IpcRenderer } from 'electron';
import { describe, expect, it } from 'vitest';

import { createInkNoteApi } from '../../src/preload/api';
import {
  IPC_CHANNELS,
  success,
  type NoteProjection,
} from '../../src/shared/ipc';

const note: NoteProjection = {
  id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'Architecture',
  body: 'Local-first.',
  isPinned: false,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  deletedAt: null,
  revision: 1,
};

function createIpc(response: unknown = success(note)) {
  const invocations: Array<{ channel: string; input: unknown }> = [];
  const listeners = new Map<
    string,
    (event: unknown, payload: unknown) => void
  >();

  const ipc = {
    invoke: async (channel: string, input: unknown) => {
      invocations.push({ channel, input });
      return response;
    },
    on: (
      channel: string,
      listener: (event: unknown, payload: unknown) => void,
    ) => {
      listeners.set(channel, listener);
    },
    removeListener: (
      channel: string,
      listener: (event: unknown, payload: unknown) => void,
    ) => {
      if (listeners.get(channel) === listener) {
        listeners.delete(channel);
      }
    },
  } as Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>;

  return { invocations, ipc, listeners };
}

describe('InkNote preload API', () => {
  it('uses a fixed channel and normalizes note input before invoking IPC', async () => {
    const { invocations, ipc } = createIpc();
    const api = createInkNoteApi(ipc);

    await expect(
      api.notes.create({ title: '  Architecture  ', body: 'Local-first.' }),
    ).resolves.toEqual(success(note));
    expect(invocations).toEqual([
      {
        channel: IPC_CHANNELS.notes.create,
        input: { title: 'Architecture', body: 'Local-first.' },
      },
    ]);
  });

  it('rejects invalid data without crossing the preload boundary', async () => {
    const { invocations, ipc } = createIpc();
    const api = createInkNoteApi(ipc);

    await expect(
      api.notes.create({ title: 'Architecture', body: 42 } as never),
    ).resolves.toEqual({ ok: false, error: { code: 'invalid_input' } });
    expect(invocations).toEqual([]);
  });

  it('sends a revision-bound update through its fixed channel', async () => {
    const { invocations, ipc } = createIpc();
    const api = createInkNoteApi(ipc);

    await expect(
      api.notes.update({
        id: note.id,
        title: '  Updated  ',
        body: 'Local-first.',
        expectedRevision: 1,
      }),
    ).resolves.toEqual(success(note));
    expect(invocations).toEqual([
      {
        channel: IPC_CHANNELS.notes.update,
        input: {
          id: note.id,
          title: 'Updated',
          body: 'Local-first.',
          expectedRevision: 1,
        },
      },
    ]);
  });

  it('does not forward malformed IPC responses to the renderer', async () => {
    const { ipc } = createIpc({ ok: true, data: { id: 'unsafe' } });
    const api = createInkNoteApi(ipc);

    await expect(
      api.notes.create({ title: 'Architecture', body: 'Local-first.' }),
    ).resolves.toEqual({ ok: false, error: { code: 'unavailable' } });
  });

  it('wraps event listeners and unsubscribes the exact wrapper', () => {
    const { ipc, listeners } = createIpc();
    const api = createInkNoteApi(ipc);
    const received: NoteProjection[] = [];
    const unsubscribe = api.onNoteChanged((event) => received.push(event.note));
    const listener = listeners.get(IPC_CHANNELS.events.noteChanged);

    listener?.({}, { type: 'created', note });
    listener?.({}, { type: 'unsafe', note });
    unsubscribe();

    expect(received).toEqual([note]);
    expect(listeners.has(IPC_CHANNELS.events.noteChanged)).toBe(false);
  });
});
