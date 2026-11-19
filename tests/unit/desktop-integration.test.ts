import { describe, expect, it, vi } from 'vitest';
import { createDesktopIntegration } from '../../src/main/desktop-integration';

function setup(registerResult = true) {
  const handlers = new Map<string, () => void>();
  const globalShortcut = {
    register: vi.fn((accelerator: string, handler: () => void) => {
      if (registerResult) handlers.set(accelerator, handler);
      return registerResult;
    }),
    unregister: vi.fn((accelerator: string) => {
      handlers.delete(accelerator);
    }),
  };
  const tray = { destroy: vi.fn() };
  const createTray = vi.fn(() => tray);
  const toggleWindow = vi.fn();
  const quickNote = vi.fn();
  const onFailed = vi.fn();
  const desktop = createDesktopIntegration({
    globalShortcut,
    createTray,
    toggleWindow,
    quickNote,
    onFailed,
  });
  return {
    desktop,
    handlers,
    globalShortcut,
    createTray,
    tray,
    toggleWindow,
    quickNote,
    onFailed,
  };
}
const settings = {
  globalToggleShortcut: '',
  globalQuickNoteShortcut: '',
  trayEnabled: false,
};

describe('desktop integration', () => {
  it('registers nothing by default', () => {
    const { desktop, globalShortcut, createTray } = setup();
    desktop.apply(settings);
    expect(globalShortcut.register).not.toHaveBeenCalled();
    expect(createTray).not.toHaveBeenCalled();
    expect(desktop.keepsRunning()).toBe(false);
  });

  it('runs the configured global shortcuts', () => {
    const { desktop, handlers, toggleWindow, quickNote } = setup();
    desktop.apply({
      ...settings,
      globalToggleShortcut: 'Mod-Shift-i',
      globalQuickNoteShortcut: 'Mod-Alt-n',
    });
    handlers.get('CmdOrCtrl+Shift+I')?.();
    handlers.get('CmdOrCtrl+Alt+N')?.();
    expect(toggleWindow).toHaveBeenCalledOnce();
    expect(quickNote).toHaveBeenCalledOnce();
  });

  it('replaces the previous shortcut when it changes', () => {
    const { desktop, handlers, globalShortcut } = setup();
    desktop.apply({ ...settings, globalToggleShortcut: 'Mod-Shift-i' });
    desktop.apply({ ...settings, globalToggleShortcut: 'Mod-Shift-o' });
    expect(globalShortcut.unregister).toHaveBeenCalledWith('CmdOrCtrl+Shift+I');
    expect([...handlers.keys()]).toEqual(['CmdOrCtrl+Shift+O']);
  });

  it('does not touch a shortcut that did not change', () => {
    const { desktop, globalShortcut } = setup();
    const value = { ...settings, globalToggleShortcut: 'Mod-Shift-i' };
    desktop.apply(value);
    desktop.apply(value);
    expect(globalShortcut.register).toHaveBeenCalledOnce();
  });

  it('reports a shortcut owned by another app', () => {
    const { desktop, onFailed } = setup(false);
    desktop.apply({ ...settings, globalToggleShortcut: 'Mod-Shift-i' });
    expect(onFailed).toHaveBeenCalledWith('Mod-Shift-i');
  });

  it('reports a sequence, which the system cannot register', () => {
    const { desktop, onFailed, globalShortcut } = setup();
    desktop.apply({ ...settings, globalToggleShortcut: 'Mod-k Mod-n' });
    expect(onFailed).toHaveBeenCalledWith('Mod-k Mod-n');
    expect(globalShortcut.register).not.toHaveBeenCalled();
  });

  it('creates and removes the tray icon', () => {
    const { desktop, createTray, tray } = setup();
    desktop.apply({ ...settings, trayEnabled: true });
    desktop.apply({ ...settings, trayEnabled: true });
    expect(createTray).toHaveBeenCalledOnce();
    expect(desktop.keepsRunning()).toBe(true);
    desktop.apply(settings);
    expect(tray.destroy).toHaveBeenCalledOnce();
    expect(desktop.keepsRunning()).toBe(false);
  });

  it('releases everything on dispose', () => {
    const { desktop, globalShortcut, tray } = setup();
    desktop.apply({
      ...settings,
      globalToggleShortcut: 'Mod-Shift-i',
      trayEnabled: true,
    });
    desktop.dispose();
    expect(globalShortcut.unregister).toHaveBeenCalledWith('CmdOrCtrl+Shift+I');
    expect(tray.destroy).toHaveBeenCalledOnce();
  });
});
