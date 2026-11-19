// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  executeShortcut,
  keystrokeMatches,
} from '../../src/renderer/shortcuts';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi } from '../support/renderer-api';
import {
  keybindingsSchema,
  resolveShortcutCommand,
  shortcutCommands,
  shortcutConflict,
  shortcutFor,
} from '../../src/shared/keybindings';

const command = (id: string) =>
  shortcutCommands.find((item) => item.id === id)!;

describe('Inkdrop command ids', () => {
  it.each([
    ['core:focus-search', 'core:find'],
    ['core:pin-note', 'core:pin-note-to-top'],
    ['editor:toggle-drawer', 'core:show-editor-action-menu'],
    ['editor:status-none', 'editor:change-note-status-none'],
    ['editor:status-active', 'editor:change-note-status-active'],
    ['editor:status-onhold', 'editor:change-note-status-onhold'],
    ['editor:status-completed', 'editor:change-note-status-completed'],
    ['editor:status-dropped', 'editor:change-note-status-dropped'],
  ])('renames %s and keeps saved shortcuts working', (legacy, current) => {
    expect(command(current)).toBeDefined();
    expect(command(legacy)).toBeUndefined();
    expect(resolveShortcutCommand(legacy)).toBe(current);
    expect(
      keybindingsSchema.parse([{ command: legacy, keystroke: 'Mod-Shift-y' }]),
    ).toEqual([{ command: current, keystroke: 'Mod-Shift-y' }]);
  });
});

describe('default shortcuts', () => {
  it('inserts links with Cmd/Ctrl+Alt+K', () => {
    expect(shortcutFor(command('core:insert-link'), [], true)).toBe(
      'Mod-Alt-k',
    );
  });

  it('moves notes from the editor and from the focused list', () => {
    expect(shortcutFor(command('core:move-note'), [], true)).toBe(
      'Meta-Ctrl-m',
    );
    expect(shortcutFor(command('core:move-note'), [], false)).toBe('Mod-Alt-m');
    expect(command('core:move-note-from-list')).toMatchObject({
      key: 'm',
      scope: 'note-list',
    });
  });

  it.each(['core:move-note', 'core:move-note-from-list'] as const)(
    '%s opens the move dialog for the active note',
    (id) => {
      const store = createWorkspaceStore(createApi().api);
      store.setState({ activeNoteId: 'note-1' });
      expect(executeShortcut(store, id, null)).toBe(true);
      expect(store.getState().libraryDialog).toEqual({
        kind: 'move-notes',
        ids: ['note-1'],
      });
    },
  );

  it('does not collide with another default shortcut', () => {
    for (const mac of [true, false])
      for (const id of ['core:insert-link', 'core:move-note'] as const)
        expect(
          shortcutConflict(id, shortcutFor(command(id), [], mac), [], mac),
        ).toBeUndefined();
  });
});

describe('Option shortcuts on macOS', () => {
  const event = {
    key: '˚',
    code: 'KeyK',
    metaKey: true,
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
  };

  it('matches the physical key when Option changes the character', () => {
    expect(keystrokeMatches('Mod-Alt-k', event, true)).toBe(true);
  });

  it('matches the backslash key when Option changes the character', () => {
    expect(
      keystrokeMatches(
        'Mod-Alt-\\',
        { ...event, key: '«', code: 'Backslash' },
        true,
      ),
    ).toBe(true);
  });

  it('keeps the character match outside macOS', () => {
    expect(
      keystrokeMatches(
        'Mod-Alt-k',
        { ...event, metaKey: false, ctrlKey: true },
        false,
      ),
    ).toBe(false);
  });

  it('does not match a different physical key', () => {
    expect(
      keystrokeMatches('Mod-Alt-k', { ...event, code: 'KeyJ' }, true),
    ).toBe(false);
  });
});
