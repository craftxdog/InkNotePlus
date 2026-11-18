// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installShortcuts,
  keystrokeMatches,
  executeShortcut,
} from '../../src/renderer/shortcuts';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi, firstNote } from '../support/renderer-api';
import {
  preferencesSchema,
  preferencesPatchSchema,
} from '../../src/shared/preferences';
import {
  shortcutCommands,
  shortcutConflict,
  shortcutFor,
} from '../../src/shared/keybindings';

afterEach(() => vi.useRealTimers());
it('uses the documented sidebar shortcut for both a narrow drawer and docked desktop panels', () => {
  const store = createWorkspaceStore(createApi().api);
  store.setState({ platform: 'darwin' });
  const shell = document.createElement('div');
  shell.className = 'inknote-shell';
  Object.defineProperty(shell, 'clientWidth', {
    value: 640,
    configurable: true,
  });
  document.body.append(shell);
  const stop = installShortcuts(store);
  const press = () => {
    const event = new KeyboardEvent('keydown', {
      key: '/',
      metaKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  };
  try {
    press();
    expect(store.getState().sidebarDrawerOpen).toBe(true);
    expect(store.getState().mainLayout.sidebarVisible).toBe(true);
    press();
    expect(store.getState().sidebarDrawerOpen).toBe(false);
    Object.defineProperty(shell, 'clientWidth', {
      value: 1280,
      configurable: true,
    });
    press();
    expect(store.getState().mainLayout.sidebarVisible).toBe(false);
    expect(store.getState().sidebarDrawerOpen).toBe(false);
    press();
    expect(store.getState().mainLayout.sidebarVisible).toBe(true);
  } finally {
    stop();
    shell.remove();
  }
});

it('exposes Inkdrop wrapping and line-number commands without inventing default shortcuts', async () => {
  const { api } = createApi();
  const store = createWorkspaceStore(api);
  expect(executeShortcut(store, 'editor:toggle-line-wrapping', null)).toBe(
    true,
  );
  await vi.waitFor(() =>
    expect(store.getState().preferences.lineWrapping).toBe('off'),
  );
  executeShortcut(store, 'editor:toggle-line-wrapping', null);
  await vi.waitFor(() =>
    expect(store.getState().preferences.lineWrapping).toBe('cursor'),
  );
  executeShortcut(store, 'editor:toggle-line-numbers', null);
  await vi.waitFor(() =>
    expect(store.getState().preferences.lineNumbers).toBe(false),
  );
});
it('rejects conflicting shortcut prefixes across editor and app contexts, including equivalent platform modifiers', () => {
  expect(shortcutConflict('core:new-note', 'Mod-k Mod-b', [], true)?.id).toBe(
    'core:toggle-telescope',
  );
  expect(shortcutConflict('core:new-note', 'Ctrl-s', [], false)?.id).toBe(
    'core:save-note',
  );
  expect(
    shortcutConflict(
      'core:new-note',
      'Mod-k Mod-b',
      [{ command: 'core:toggle-telescope', keystroke: '' }],
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

it('keeps stored shortcut overrides when Inkdrop command IDs replace old aliases', () => {
  const preferences = preferencesSchema.parse({
    keybindings: [{ command: 'editor:toggle-bold', keystroke: 'Mod-Shift-b' }],
  });
  expect(preferences.keybindings).toEqual([
    { command: 'core:strong', keystroke: 'Mod-Shift-b' },
  ]);
});

describe('note history shortcuts on macOS', () => {
  const pressOn = (target: Element, key = 'ArrowLeft') => {
    const event = new KeyboardEvent('keydown', {
      key,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };
  const setup = (keybindings: { command: never; keystroke: string }[] = []) => {
    const store = createWorkspaceStore(createApi().api);
    const navigateHistory = vi.fn(async () => true);
    store.setState({
      platform: 'darwin',
      navigateHistory,
      preferences: { ...store.getState().preferences, keybindings },
    });
    return { store, navigateHistory, stop: installShortcuts(store) };
  };
  const mount = (html: string) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    return host;
  };

  it.each([
    [
      'the Markdown editor',
      '<div class="cm-content" contenteditable="true"></div>',
    ],
    ['a text input', '<input class="document-title-input" />'],
    ['a text area', '<textarea></textarea>'],
  ])('leaves Cmd+Arrow to native caret movement in %s', (_name, html) => {
    const { navigateHistory, stop } = setup();
    const host = mount(html);
    try {
      for (const key of ['ArrowLeft', 'ArrowRight']) {
        const event = pressOn(host.firstElementChild!, key);
        expect(event.defaultPrevented).toBe(false);
      }
      expect(navigateHistory).not.toHaveBeenCalled();
    } finally {
      stop();
      host.remove();
    }
  });

  it('navigates note history when focus is outside text fields', () => {
    const { navigateHistory, stop } = setup();
    const host = mount('<button type="button"></button>');
    try {
      expect(pressOn(host.firstElementChild!).defaultPrevented).toBe(true);
      expect(navigateHistory).toHaveBeenCalledWith(-1);
    } finally {
      stop();
      host.remove();
    }
  });

  it('honors a binding the user explicitly assigned inside the editor', () => {
    const { navigateHistory, stop } = setup([
      { command: 'core:navigate-back' as never, keystroke: 'Meta-ArrowLeft' },
    ]);
    const host = mount('<div class="cm-content" contenteditable="true"></div>');
    try {
      pressOn(host.firstElementChild!);
      expect(navigateHistory).toHaveBeenCalledWith(-1);
    } finally {
      stop();
      host.remove();
    }
  });
});

describe('Cmd/Ctrl+D', () => {
  it('duplicates the note from the editor instead of deleting the line', () => {
    const store = createWorkspaceStore(createApi().api);
    const duplicateNotes = vi.fn(async () => true);
    store.setState({
      platform: 'linux',
      activeNoteId: firstNote.id,
      duplicateNotes,
    });
    const stop = installShortcuts(store);
    const editor = document.createElement('div');
    editor.className = 'cm-content';
    document.body.append(editor);
    const press = (repeat = false) => {
      const event = new KeyboardEvent('keydown', {
        key: 'd',
        ctrlKey: true,
        repeat,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(event);
      return event;
    };
    try {
      expect(press().defaultPrevented).toBe(true);
      expect(duplicateNotes).toHaveBeenCalledTimes(1);
      press(true);
      expect(duplicateNotes).toHaveBeenCalledTimes(1);
    } finally {
      stop();
      editor.remove();
    }
  });
  it('leaves line deletion available without a default shortcut', () => {
    const command = shortcutCommands.find(
      ({ id }) => id === 'editor:delete-line',
    )!;
    expect(shortcutFor(command, [], false)).toBe('');
    expect(shortcutFor(command, [], true)).toBe('');
  });
  it('does nothing in Trash or without a note', () => {
    const store = createWorkspaceStore(createApi().api);
    expect(executeShortcut(store, 'core:duplicate-note', null)).toBe(false);
    store.setState({
      activeNoteId: firstNote.id,
      navigation: { type: 'trash' },
    });
    expect(executeShortcut(store, 'core:duplicate-note', null)).toBe(false);
  });
});
