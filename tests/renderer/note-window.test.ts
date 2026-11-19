// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { noteWindowTarget } from '../../src/renderer/state/note-window';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { executeShortcut } from '../../src/renderer/shortcuts';
import { createApi, firstNote } from '../support/renderer-api';
import {
  shortcutCommands,
  shortcutConflict,
  shortcutFor,
} from '../../src/shared/keybindings';

const id = '11111111-1111-4111-8111-111111111111';

describe('noteWindowTarget', () => {
  it.each([
    ['', null],
    ['?noteWindow=new', 'new'],
    [`?noteWindow=${id}`, id],
    ['?noteWindow=../../x', null],
  ])('%s', (search, expected) =>
    expect(noteWindowTarget(search)).toBe(expected),
  );
});

describe('note window store', () => {
  it('starts without the library panels', () => {
    const store = createWorkspaceStore(createApi().api, undefined, 'new');
    expect(store.getState().noteWindow).toBe('new');
    expect(store.getState().mainLayout.distractionFreeEnabled).toBe(true);
  });

  it('keeps the main window layout unchanged', () => {
    const store = createWorkspaceStore(createApi().api);
    expect(store.getState().noteWindow).toBeNull();
    expect(store.getState().mainLayout.distractionFreeEnabled).toBe(false);
  });
});

describe('open note in a window', () => {
  const command = shortcutCommands.find(
    (item) => item.id === 'core:open-note-in-window',
  )!;

  it('uses Cmd/Ctrl+Shift+N without colliding', () => {
    expect(shortcutFor(command, [], true)).toBe('Mod-Shift-n');
    for (const mac of [true, false])
      expect(
        shortcutConflict(command.id, 'Mod-Shift-n', [], mac),
      ).toBeUndefined();
  });

  it('opens the active note', () => {
    const { api } = createApi();
    const open = vi.fn(async () => ({ ok: true as const, data: true }));
    api.openNoteWindow = open;
    const store = createWorkspaceStore(api);
    store.setState({ activeNoteId: firstNote.id });
    expect(executeShortcut(store, command.id, null)).toBe(true);
    expect(open).toHaveBeenCalledWith(firstNote.id);
  });

  it('does nothing without an open note', () => {
    const store = createWorkspaceStore(createApi().api);
    expect(executeShortcut(store, command.id, null)).toBe(false);
  });
});
