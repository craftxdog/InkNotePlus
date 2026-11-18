import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import {
  claimSingleInstance,
  revealWindow,
} from '../../src/main/single-instance';

function fakeApp(locked: boolean) {
  return Object.assign(new EventEmitter(), {
    requestSingleInstanceLock: vi.fn(() => locked),
    quit: vi.fn(),
  });
}

it('quits a second process before it can open the shared profile', () => {
  const app = fakeApp(false);
  const onSecondInstance = vi.fn();
  expect(claimSingleInstance(app, onSecondInstance)).toBe(false);
  expect(app.quit).toHaveBeenCalledTimes(1);
  app.emit('second-instance');
  expect(onSecondInstance).not.toHaveBeenCalled();
});

it('keeps the first process running and notifies it about later launches', () => {
  const app = fakeApp(true);
  const onSecondInstance = vi.fn();
  expect(claimSingleInstance(app, onSecondInstance)).toBe(true);
  expect(app.quit).not.toHaveBeenCalled();
  app.emit('second-instance');
  expect(onSecondInstance).toHaveBeenCalledTimes(1);
});

it('restores a minimized window before focusing it', () => {
  const calls: string[] = [];
  const window = {
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };
  revealWindow(window);
  expect(calls).toEqual(['restore', 'show', 'focus']);
});

it('does not restore a window that is not minimized', () => {
  const restore = vi.fn();
  const focus = vi.fn();
  revealWindow({ isMinimized: () => false, restore, show: vi.fn(), focus });
  expect(restore).not.toHaveBeenCalled();
  expect(focus).toHaveBeenCalledTimes(1);
});
