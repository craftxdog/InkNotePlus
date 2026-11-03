import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it } from 'vitest';

import { CommandRegistry } from '../../src/application/command-registry';
import { NOTE_COMMAND_IDS } from '../../src/application/note-commands';
import { registerNoteIpcHandlers } from '../../src/main/ipc/note-handlers';
import {
  IPC_CHANNELS,
  failure,
  success,
  type NoteChangedEvent,
  type NoteProjection,
  type Result,
} from '../../src/shared/ipc';

type RegisteredHandler = (
  event: IpcMainInvokeEvent,
  input: unknown,
) => Promise<unknown>;

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

function setup() {
  const handlers = new Map<string, RegisteredHandler>();
  const registry = new CommandRegistry();
  const frame = {};
  const webContents = { mainFrame: frame } as WebContents;
  const changedEvents: NoteChangedEvent[] = [];
  const ipc = {
    handle: (channel: string, handler: RegisteredHandler) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  } as Pick<IpcMain, 'handle' | 'removeHandler'>;

  const registration = registerNoteIpcHandlers({
    ipc,
    commands: registry,
    getMainWebContents: () => webContents,
    publishNoteChanged: (event) => changedEvents.push(event),
  });

  return {
    changedEvents,
    event: { sender: webContents, senderFrame: frame } as IpcMainInvokeEvent,
    handlers,
    registration,
    registry,
  };
}

describe('note IPC handlers', () => {
  it('registers only the explicit note invoke channels', () => {
    const { handlers } = setup();

    expect([...handlers.keys()].sort()).toEqual([
      IPC_CHANNELS.notes.create,
      IPC_CHANNELS.notes.list,
      IPC_CHANNELS.notes.moveToTrash,
      IPC_CHANNELS.notes.restore,
      IPC_CHANNELS.notes.search,
      IPC_CHANNELS.notes.update,
    ]);
  });

  it('removes every registered channel when its module deactivates', () => {
    const { handlers, registration } = setup();

    registration.dispose();

    expect(handlers).toEqual(new Map());
  });

  it('rejects untrusted senders before invoking a command', async () => {
    const { handlers, registry } = setup();
    let executions = 0;
    registry.register({
      id: NOTE_COMMAND_IDS.create,
      execute: () => {
        executions += 1;
        return success(note);
      },
    });

    const result = await handlers.get(IPC_CHANNELS.notes.create)?.(
      {
        sender: { mainFrame: {} } as WebContents,
        senderFrame: {},
      } as IpcMainInvokeEvent,
      { title: 'Architecture', body: 'Local-first.' },
    );

    expect(result).toEqual(failure('unavailable'));
    expect(executions).toBe(0);
  });

  it('validates input and publishes a confirmed mutation projection', async () => {
    const { changedEvents, event, handlers, registry } = setup();
    registry.register({
      id: NOTE_COMMAND_IDS.create,
      execute: () => success(note),
    });

    const invalidResult = await handlers.get(IPC_CHANNELS.notes.create)?.(
      event,
      { title: 'Architecture' },
    );
    const result = await handlers.get(IPC_CHANNELS.notes.create)?.(event, {
      title: '  Architecture  ',
      body: 'Local-first.',
    });

    expect(invalidResult).toEqual(failure('invalid_input'));
    expect(result).toEqual(success(note));
    expect(changedEvents).toEqual([{ type: 'created', note }]);
  });

  it('publishes only a confirmed update event', async () => {
    const { changedEvents, event, handlers, registry } = setup();
    const updatedNote = { ...note, title: 'Updated', revision: 2 };
    registry.register({
      id: NOTE_COMMAND_IDS.update,
      execute: () => success(updatedNote),
    });

    const result = await handlers.get(IPC_CHANNELS.notes.update)?.(event, {
      id: note.id,
      title: 'Updated',
      body: note.body,
      expectedRevision: note.revision,
    });

    expect(result).toEqual(success(updatedNote));
    expect(changedEvents).toEqual([{ type: 'updated', note: updatedNote }]);
  });

  it('returns only a safe domain result to the renderer', async () => {
    const { event, handlers, registry } = setup();
    registry.register({
      id: NOTE_COMMAND_IDS.moveToTrash,
      execute: () => failure<NoteProjection>('not_found'),
    });

    const result = await handlers.get(IPC_CHANNELS.notes.moveToTrash)?.(event, {
      id: note.id,
    });

    expect(result).toEqual(failure('not_found'));
  });

  it('does not emit data that fails the output contract', async () => {
    const { event, handlers, registry } = setup();
    registry.register({
      id: NOTE_COMMAND_IDS.create,
      execute: () =>
        success({
          ...note,
          revision: 0,
        }) as Result<NoteProjection>,
    });

    const result = await handlers.get(IPC_CHANNELS.notes.create)?.(event, {
      title: 'Architecture',
      body: 'Local-first.',
    });

    expect(result).toEqual(failure('unavailable'));
  });
});
