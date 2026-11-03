import { describe, expect, it } from 'vitest';

import {
  CommandRegistry,
  DuplicateCommandIdError,
  InvalidCommandIdError,
} from '../../src/application/command-registry';

describe('CommandRegistry', () => {
  it('executes a registered command and returns its data', async () => {
    const registry = new CommandRegistry();
    registry.register({
      id: 'notes:create',
      execute: ({ title }: { title: string }) => ({ id: 'note-1', title }),
    });

    await expect(
      registry.execute<{ id: string; title: string }>('notes:create', {
        title: 'Architecture',
      }),
    ).resolves.toEqual({
      ok: true,
      data: { id: 'note-1', title: 'Architecture' },
    });
  });

  it('returns a safe result for an unknown command', async () => {
    const registry = new CommandRegistry();

    await expect(registry.execute('notes:missing', undefined)).resolves.toEqual(
      {
        ok: false,
        error: {
          code: 'command.not-found',
          message: 'Command is not available.',
        },
      },
    );
  });

  it('does not leak an execution error to the caller', async () => {
    const registry = new CommandRegistry();
    registry.register({
      id: 'notes:explode',
      execute: () => {
        throw new Error('sqlite path: /private/secret.db');
      },
    });

    await expect(registry.execute('notes:explode', undefined)).resolves.toEqual(
      {
        ok: false,
        error: {
          code: 'command.failed',
          message: 'Command could not be completed.',
        },
      },
    );
  });

  it('rejects malformed and duplicate command identifiers', () => {
    const registry = new CommandRegistry();

    expect(() =>
      registry.register({ id: 'notes.create', execute: () => undefined }),
    ).toThrow(InvalidCommandIdError);

    registry.register({ id: 'notes:create', execute: () => undefined });

    expect(() =>
      registry.register({ id: 'notes:create', execute: () => undefined }),
    ).toThrow(DuplicateCommandIdError);
  });

  it('disposes only its own registration and is idempotent', async () => {
    const registry = new CommandRegistry();
    const first = registry.register({
      id: 'notes:create',
      execute: () => 'first',
    });

    first.dispose();
    const second = registry.register({
      id: 'notes:create',
      execute: () => 'second',
    });

    first.dispose();

    await expect(registry.execute('notes:create', undefined)).resolves.toEqual({
      ok: true,
      data: 'second',
    });

    second.dispose();
    second.dispose();

    await expect(registry.execute('notes:create', undefined)).resolves.toEqual({
      ok: false,
      error: {
        code: 'command.not-found',
        message: 'Command is not available.',
      },
    });
  });
});
