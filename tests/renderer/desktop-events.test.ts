// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installShortcuts } from '../../src/renderer/shortcuts';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success } from '../../src/shared/ipc';
import { createApi, firstNote, secondNote } from '../support/renderer-api';

afterEach(() => vi.useRealTimers());

function setup() {
  let emitMenu: (command: string) => void = () => {};
  let emitLink: (url: string) => void = () => {};
  const { api } = createApi({
    list: async (input = {}) =>
      success(
        input.id
          ? [firstNote, secondNote].filter(({ id }) => id === input.id)
          : [firstNote],
      ),
  });
  api.onMenuCommand = (listener) => {
    emitMenu = listener;
    return () => {};
  };
  api.links.onOpenNote = (listener) => {
    emitLink = listener;
    return () => {};
  };
  const store = createWorkspaceStore(api);
  return {
    store,
    menu: (command: string) => emitMenu(command),
    link: (url: string) => emitLink(url),
  };
}

describe('application menu commands', () => {
  it('runs the chosen command', () => {
    const { store, menu } = setup();
    const createNote = vi.fn(async () => {});
    store.setState({ createNote });
    const stop = installShortcuts(store);
    menu('core:new-note');
    expect(createNote).toHaveBeenCalledTimes(1);
    stop();
  });
  it('does not repeat a shortcut the keyboard just handled', () => {
    const { store, menu } = setup();
    const createNote = vi.fn(async () => {});
    store.setState({ platform: 'linux', createNote });
    const stop = installShortcuts(store);
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        cancelable: true,
      }),
    );
    menu('core:new-note');
    expect(createNote).toHaveBeenCalledTimes(1);
    stop();
  });
  it('waits while a dialog is open, except for closing Preferences', () => {
    const { store, menu } = setup();
    const createNote = vi.fn(async () => {});
    store.setState({ createNote, settingsOpen: true });
    const stop = installShortcuts(store);
    menu('core:new-note');
    expect(createNote).not.toHaveBeenCalled();
    menu('application:open-preferences');
    expect(store.getState().settingsOpen).toBe(false);
    stop();
  });
  it('ignores unknown commands', () => {
    const { store, menu } = setup();
    const stop = installShortcuts(store);
    expect(() => menu('core:not-a-command')).not.toThrow();
    stop();
  });
  it('starts imports and exports from the menu', () => {
    const { store, menu } = setup();
    const importNotes = vi.fn(async () => {});
    const exportNotes = vi.fn(async () => {});
    store.setState({ importNotes, exportNotes });
    const stop = installShortcuts(store);
    menu('import-markdown:import-from-file');
    menu('inknote:import-folder');
    menu('export-as-html:all');
    expect(importNotes.mock.calls).toEqual([['files'], ['folder']]);
    expect(exportNotes).toHaveBeenCalledWith({
      format: 'html',
      scope: { kind: 'all' },
    });
    stop();
  });
});

describe('links opened from outside the app', () => {
  it('opens the note once the library has loaded', async () => {
    const { store, link } = setup();
    const stop = store.getState().connect();
    link(`inknote://note/${secondNote.id}`);
    await vi.waitFor(() =>
      expect(store.getState().activeNoteId).toBe(secondNote.id),
    );
    stop();
  });
});
