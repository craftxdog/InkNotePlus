// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPluginBroker } from '../../src/renderer/plugins/plugin-broker';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi, firstNote } from '../support/renderer-api';

const bookId = '22222222-2222-4222-8222-222222222222';
function setup() {
  const { api } = createApi();
  const store = createWorkspaceStore(api);
  const broker = createPluginBroker({ store, api, plugin: 'p' });
  return { api, store, broker };
}
let context: ReturnType<typeof setup>;
beforeEach(() => {
  context = setup();
});

describe('plugin broker', () => {
  it('rejects unknown methods', async () => {
    await expect(context.broker('app.quit', {})).rejects.toThrow(
      'no permitido',
    );
  });

  it('rejects malformed parameters', async () => {
    await expect(context.broker('notes.get', { id: 5 })).rejects.toThrow();
    await expect(
      context.broker('notes.all', { limit: 9999 }),
    ).rejects.toThrow();
  });

  it('reads a note in the Inkdrop document shape', async () => {
    context.api.notes.list = vi.fn(async () => ({
      ok: true as const,
      data: [firstNote],
    }));
    const doc = await context.broker('notes.get', {
      id: `note:${firstNote.id}`,
    });
    expect(doc).toMatchObject({
      _id: `note:${firstNote.id}`,
      _rev: String(firstNote.revision),
      title: firstNote.title,
      body: firstNote.body,
      doctype: 'markdown',
    });
  });

  it('creates a note', async () => {
    const create = vi.fn(async () => ({ ok: true as const, data: firstNote }));
    context.api.notes.create = create;
    await context.broker('notes.put', {
      doc: {
        title: 'Nueva',
        body: 'Texto',
        bookId: `book:${bookId}`,
        tags: ['a'],
        status: 'onHold',
      },
    });
    expect(create).toHaveBeenCalledWith({
      title: 'Nueva',
      body: 'Texto',
      metadata: expect.objectContaining({
        notebookId: bookId,
        tags: ['a'],
        status: 'onhold',
      }),
    });
  });

  it('updates with the revision the plugin read', async () => {
    const update = vi.fn(async () => ({ ok: true as const, data: firstNote }));
    context.api.notes.update = update;
    context.api.notes.list = vi.fn(async () => ({
      ok: true as const,
      data: [firstNote],
    }));
    await context.broker('notes.put', {
      doc: {
        _id: `note:${firstNote.id}`,
        _rev: '4',
        title: 'Editada',
        body: 'B',
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: firstNote.id,
        expectedRevision: 4,
        title: 'Editada',
      }),
    );
  });

  it('never offers permanent deletion', async () => {
    await expect(
      context.broker('notes.remove', { id: 'note:1' }),
    ).rejects.toThrow('no permitido');
  });

  it('shows notifications with the plugin name', async () => {
    await context.broker('notifications.add', {
      level: 'info',
      message: 'Hola',
    });
    expect(context.store.getState().pluginNotices).toMatchObject([
      { plugin: 'p', level: 'info', message: 'Hola' },
    ]);
  });

  it('runs built-in commands and refuses unknown ones', async () => {
    context.store.setState({ commandPaletteOpen: false });
    await context.broker('commands.dispatch', {
      name: 'core:toggle-telescope',
    });
    expect(context.store.getState().commandPaletteOpen).toBe(true);
    await expect(
      context.broker('commands.dispatch', { name: 'x:y' }),
    ).rejects.toThrow();
  });

  it('refuses to open Preferences, where plugins are managed', async () => {
    await expect(
      context.broker('commands.dispatch', {
        name: 'application:open-preferences',
      }),
    ).rejects.toThrow();
  });
});
