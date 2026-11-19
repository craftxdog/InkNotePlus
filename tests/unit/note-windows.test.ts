import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createNoteWindows } from '../../src/main/note-windows';
import {
  isTrustedIpcEvent,
  trustWebContents,
} from '../../src/main/ipc/note-handlers';

const id = '11111111-1111-4111-8111-111111111111';
function fakeWindow() {
  const window = Object.assign(new EventEmitter(), {
    webContents: { send: vi.fn(), isDestroyed: () => false },
    focus: vi.fn(),
    isDestroyed: () => false,
    show: vi.fn(),
  });
  return window;
}

function setup() {
  const windows: ReturnType<typeof fakeWindow>[] = [];
  const create = vi.fn(() => {
    const window = fakeWindow();
    windows.push(window);
    return window as never;
  });
  return { notes: createNoteWindows({ create }), create, windows };
}

describe('note windows', () => {
  it('opens a window for a note', () => {
    const { notes, create } = setup();
    notes.open(id);
    expect(create).toHaveBeenCalledWith(id);
  });

  it('focuses the window a note already has', () => {
    const { notes, create, windows } = setup();
    notes.open(id);
    notes.open(id);
    expect(create).toHaveBeenCalledOnce();
    expect(windows[0].focus).toHaveBeenCalledOnce();
  });

  it('opens a new window for each quick note', () => {
    const { notes, create } = setup();
    notes.open(null);
    notes.open(null);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('can open a note again after its window closes', () => {
    const { notes, create, windows } = setup();
    notes.open(id);
    windows[0].emit('closed');
    notes.open(id);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('sends events to every open window', () => {
    const { notes, windows } = setup();
    notes.open(id);
    notes.open(null);
    notes.broadcast('canal', { a: 1 });
    for (const window of windows)
      expect(window.webContents.send).toHaveBeenCalledWith('canal', { a: 1 });
  });
});

describe('trusted windows', () => {
  const frame = {};
  const contents = { mainFrame: frame };
  const event = (sender: unknown, senderFrame: unknown = frame) =>
    ({ sender, senderFrame }) as never;

  it('rejects an unknown window', () => {
    expect(isTrustedIpcEvent(event(contents), null)).toBe(false);
  });

  it('accepts a registered note window until it closes', () => {
    const stop = trustWebContents(contents as never);
    expect(isTrustedIpcEvent(event(contents), null)).toBe(true);
    stop();
    expect(isTrustedIpcEvent(event(contents), null)).toBe(false);
  });

  it('rejects a subframe inside a registered window', () => {
    const stop = trustWebContents(contents as never);
    expect(isTrustedIpcEvent(event(contents, {}), null)).toBe(false);
    stop();
  });
});
