// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  installShortcuts,
  keystrokeMatches,
} from '../../src/renderer/shortcuts';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi } from '../support/renderer-api';
import {
  preferencesSchema,
  preferencesPatchSchema,
} from '../../src/shared/preferences';
import { shortcutConflict } from '../../src/shared/keybindings';

afterEach(() => vi.useRealTimers());
it('rejects conflicting shortcut prefixes across editor and app contexts, including equivalent platform modifiers', () => {
  expect(shortcutConflict('core:new-note', 'Mod-k Mod-b', [], true)?.id).toBe(
    'editor:insert-link',
  );
  expect(shortcutConflict('core:new-note', 'Ctrl-s', [], false)?.id).toBe(
    'core:save-note',
  );
  expect(
    shortcutConflict(
      'core:new-note',
      'Mod-k Mod-b',
      [{ command: 'editor:insert-link', keystroke: '' }],
      true,
    ),
  ).toBeUndefined();
});
it('matches platform modifiers, punctuation and shifted letters without intercepting native select-all', () => {
  const event = {
    key: '-',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  };
  expect(keystrokeMatches('Mod--', event, true)).toBe(true);
  expect(keystrokeMatches('Mod--', event, false)).toBe(false);
  expect(
    keystrokeMatches(
      'Mod-Shift-n',
      { ...event, key: 'N', shiftKey: true },
      true,
    ),
  ).toBe(true);
});
it('honors overrides, disabled bindings and multistroke sequences', () => {
  const { api } = createApi();
  const store = createWorkspaceStore(api);
  const create = vi.fn(async () => {});
  store.setState({
    platform: 'linux',
    createNote: create,
    preferences: {
      ...store.getState().preferences,
      keybindings: [{ command: 'core:new-note', keystroke: 'Mod-k Mod-n' }],
    },
  });
  const stop = installShortcuts(store);
  const press = (key: string, ctrlKey = true) => {
    const event = new KeyboardEvent('keydown', {
      key,
      ctrlKey,
      cancelable: true,
    });
    window.dispatchEvent(event);
    return event;
  };
  expect(press('n').defaultPrevented).toBe(false);
  expect(press('a').defaultPrevented).toBe(false);
  expect(press('k').defaultPrevented).toBe(true);
  press('n');
  expect(create).toHaveBeenCalledTimes(1);
  store.setState({
    preferences: {
      ...store.getState().preferences,
      keybindings: [{ command: 'core:new-note', keystroke: '' }],
    },
  });
  press('n');
  expect(create).toHaveBeenCalledTimes(1);
  stop();
  press('n');
  expect(create).toHaveBeenCalledTimes(1);
});
it('fills new preferences for existing installations and never injects defaults into a patch', () => {
  expect(
    preferencesSchema.parse({
      theme: 'inknote-dark',
      sidebarWidth: 230,
      noteListWidth: 300,
      editorMode: 'edit',
    }),
  ).toMatchObject({ theme: 'inknote-dark', splitRatio: 50, mathEnabled: true });
  expect(preferencesPatchSchema.parse({ editorFontSize: 18 })).toEqual({
    editorFontSize: 18,
  });
  expect(
    preferencesPatchSchema.safeParse({ editorFontFamily: 'url(https://bad)' })
      .success,
  ).toBe(false);
});
