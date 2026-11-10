import { describe, expect, it } from 'vitest';

import { CommandRegistry } from '../../src/application/command-registry';
import {
  NOTE_COMMAND_IDS,
  registerNoteCommands,
} from '../../src/application/note-commands';
import {
  NoteConflictError,
  NoteNotFoundError,
  type NoteRepository,
} from '../../src/domain/note-repository';
import type { Note } from '../../src/domain/note';
import type { Result } from '../../src/shared/ipc';

const note: Note = {
  id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'Architecture',
  body: 'Local-first.',
  isPinned: false,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  deletedAt: null,
  revision: 1,
};

function createRepository(
  overrides: Partial<NoteRepository> = {},
): NoteRepository {
  return {
    create: () => note,
    update: () => note,
    list: () => [note],
    search: () => [note],
    moveToTrash: () => ({ ...note, deletedAt: note.updatedAt, revision: 2 }),
    restore: () => note,
    manageTrash: () => 0,
    ...overrides,
  };
}

describe('note commands', () => {
  it('uses the registry as the only route to persist a note', async () => {
    const registry = new CommandRegistry();
    registerNoteCommands(registry, createRepository());

    await expect(
      registry.execute<Result<Note>>(NOTE_COMMAND_IDS.create, {
        title: 'Architecture',
        body: 'Local-first.',
      }),
    ).resolves.toEqual({ ok: true, data: { ok: true, data: note } });
  });

  it('maps known domain errors to a safe result', async () => {
    const registry = new CommandRegistry();
    registerNoteCommands(
      registry,
      createRepository({
        moveToTrash: () => {
          throw new NoteNotFoundError(note.id);
        },
      }),
    );

    await expect(
      registry.execute<Result<Note>>(NOTE_COMMAND_IDS.moveToTrash, {
        id: note.id,
      }),
    ).resolves.toEqual({
      ok: true,
      data: { ok: false, error: { code: 'not_found' } },
    });
  });

  it('maps stale note writes to a conflict result', async () => {
    const registry = new CommandRegistry();
    registerNoteCommands(
      registry,
      createRepository({
        update: () => {
          throw new NoteConflictError(note.id);
        },
      }),
    );

    await expect(
      registry.execute<Result<Note>>(NOTE_COMMAND_IDS.update, {
        id: note.id,
        title: 'Architecture',
        body: 'Local-first.',
        expectedRevision: note.revision,
      }),
    ).resolves.toEqual({
      ok: true,
      data: { ok: false, error: { code: 'conflict' } },
    });
  });

  it('unregisters all note commands together', async () => {
    const registry = new CommandRegistry();
    const commands = registerNoteCommands(registry, createRepository());

    commands.dispose();

    await expect(
      registry.execute(NOTE_COMMAND_IDS.list, {}),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'command.not-found' },
    });
  });
});
