import { toAccelerator } from './app-menu';

export interface DesktopSettings {
  globalToggleShortcut: string;
  globalQuickNoteShortcut: string;
  trayEnabled: boolean;
}

export function createDesktopIntegration(options: {
  globalShortcut: {
    register(accelerator: string, callback: () => void): boolean;
    unregister(accelerator: string): void;
  };
  createTray: () => { destroy(): void };
  toggleWindow: () => void;
  quickNote: () => void;
  onFailed: (keystroke: string) => void;
}) {
  const active = new Map<'toggle' | 'quick', string>();
  const stored = new Map<'toggle' | 'quick', string>();
  let tray: { destroy(): void } | null = null;

  function bind(slot: 'toggle' | 'quick', keystroke: string, run: () => void) {
    if (stored.get(slot) === keystroke) return;
    stored.set(slot, keystroke);
    const previous = active.get(slot);
    if (previous) options.globalShortcut.unregister(previous);
    active.delete(slot);
    if (!keystroke) return;
    const accelerator = toAccelerator(keystroke);
    if (accelerator && options.globalShortcut.register(accelerator, run))
      active.set(slot, accelerator);
    else options.onFailed(keystroke);
  }

  return {
    apply(settings: DesktopSettings) {
      bind('toggle', settings.globalToggleShortcut, options.toggleWindow);
      bind('quick', settings.globalQuickNoteShortcut, options.quickNote);
      if (settings.trayEnabled && !tray) tray = options.createTray();
      if (!settings.trayEnabled && tray) {
        tray.destroy();
        tray = null;
      }
    },
    keepsRunning: () => tray !== null,
    dispose() {
      for (const accelerator of active.values())
        options.globalShortcut.unregister(accelerator);
      active.clear();
      stored.clear();
      tray?.destroy();
      tray = null;
    },
  };
}
