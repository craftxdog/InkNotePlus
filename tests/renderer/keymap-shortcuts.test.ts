// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { installShortcuts } from '../../src/renderer/shortcuts';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import type { KeymapEntry } from '../../src/shared/keymap-file';
import { createApi } from '../support/renderer-api';

let stop = () => {};
afterEach(() => {
  stop();
  document.body.replaceChildren();
});

function setup(entries: KeymapEntry[]) {
  const store = createWorkspaceStore(createApi().api);
  store.setState({
    platform: 'linux',
    keymap: { path: '/keymap.json', entries, errors: [] },
  });
  stop = installShortcuts(store);
  const box = document.createElement('div');
  box.className = 'box';
  const inner = document.createElement('button');
  inner.className = 'inner';
  box.append(inner);
  document.body.append(box);
  const press = (key: string, ctrlKey = true, target: Element = inner) => {
    const event = new KeyboardEvent('keydown', {
      key,
      ctrlKey,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };
  return { store, press, box };
}

describe('keymap.json', () => {
  it('runs a command when the selector matches', () => {
    const { store, press } = setup([
      {
        selector: '.box',
        keystroke: 'Mod-y',
        command: 'core:toggle-telescope',
      },
    ]);
    expect(press('y').defaultPrevented).toBe(true);
    expect(store.getState().commandPaletteOpen).toBe(true);
  });

  it('ignores the entry outside its selector', () => {
    const { store, press } = setup([
      {
        selector: '.other',
        keystroke: 'Mod-y',
        command: 'core:toggle-telescope',
      },
    ]);
    expect(press('y').defaultPrevented).toBe(false);
    expect(store.getState().commandPaletteOpen).toBe(false);
  });

  it('prefers the selector closest to the focused element', () => {
    const { store, press } = setup([
      {
        selector: '.inner',
        keystroke: 'Mod-y',
        command: 'core:toggle-telescope',
      },
      { selector: '.box', keystroke: 'Mod-y', command: 'abort!' },
    ]);
    press('y');
    expect(store.getState().commandPaletteOpen).toBe(true);
  });

  it('runs sequences', () => {
    const { store, press } = setup([
      {
        selector: 'body',
        keystroke: 'Mod-y Mod-u',
        command: 'core:toggle-telescope',
      },
    ]);
    expect(press('y').defaultPrevented).toBe(true);
    expect(store.getState().commandPaletteOpen).toBe(false);
    press('u');
    expect(store.getState().commandPaletteOpen).toBe(true);
  });

  it('native! leaves the key to the platform', () => {
    const { store, press } = setup([
      { selector: 'body', keystroke: 'Mod-k', command: 'native!' },
    ]);
    expect(press('k').defaultPrevented).toBe(false);
    expect(store.getState().commandPaletteOpen).toBe(false);
  });

  it('unset! removes the default shortcut', () => {
    const { store, press } = setup([
      { selector: 'body', keystroke: 'Mod-k', command: 'unset!' },
    ]);
    press('k');
    expect(store.getState().commandPaletteOpen).toBe(false);
  });

  it('abort! consumes the key without running anything', () => {
    const { store, press } = setup([
      { selector: 'body', keystroke: 'Mod-k', command: 'abort!' },
    ]);
    expect(press('k').defaultPrevented).toBe(true);
    expect(store.getState().commandPaletteOpen).toBe(false);
  });

  it('skips an invalid selector without breaking other shortcuts', () => {
    const { store, press } = setup([
      { selector: '..mal', keystroke: 'Mod-k', command: 'abort!' },
    ]);
    press('k');
    expect(store.getState().commandPaletteOpen).toBe(true);
  });

  it('stays inactive while a dialog is open', () => {
    const { store, press } = setup([
      { selector: 'body', keystroke: 'Mod-y', command: 'core:new-note' },
    ]);
    store.setState({ settingsOpen: true });
    expect(press('y').defaultPrevented).toBe(false);
  });
});
