import type { BrowserWindow } from 'electron';

export function createNoteWindows(options: {
  create: (noteId: string | null) => BrowserWindow;
}) {
  const open = new Set<BrowserWindow>();
  const byNote = new Map<string, BrowserWindow>();
  return {
    open(noteId: string | null) {
      const existing = noteId ? byNote.get(noteId) : undefined;
      if (existing && !existing.isDestroyed()) {
        existing.show();
        existing.focus();
        return existing;
      }
      const window = options.create(noteId);
      open.add(window);
      if (noteId) byNote.set(noteId, window);
      window.once('closed', () => {
        open.delete(window);
        if (noteId) byNote.delete(noteId);
      });
      return window;
    },
    broadcast(channel: string, payload: unknown) {
      for (const window of open)
        if (!window.isDestroyed()) window.webContents.send(channel, payload);
    },
  };
}
