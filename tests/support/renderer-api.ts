import type { InkNoteApi } from '../../src/preload/api';
import { defaultPreferences } from '../../src/shared/preferences';
import { success } from '../../src/shared/ipc';
import { emptyLibrary } from '../../src/shared/library';
import {
  failure,
  type NoteChangedEvent,
  type NoteProjection,
} from '../../src/shared/ipc';

export const firstNote: NoteProjection = {
  id: '5a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'First',
  body: 'First body',
  isPinned: false,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  deletedAt: null,
  revision: 1,
};

export const secondNote: NoteProjection = {
  ...firstNote,
  id: '6a5115f8-747f-416d-82d5-d9c12e34d323',
  title: 'Second',
  body: 'Second body',
  updatedAt: '2026-10-30T13:00:00.000Z',
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

export function createApi(overrides: Partial<InkNoteApi['notes']> = {}) {
  const listeners = new Set<(event: NoteChangedEvent) => void>();
  let preferences = { ...defaultPreferences };
  const api: InkNoteApi = {
    images: {
      importFile: async () => success(null),
      write: async () => success(null),
    },
    themes: {
      list: async () => ({ ok: true, data: [] }),
      browse: async () => ({ ok: true, data: [] }),
      install: async () => ({ ok: false, error: { code: 'unavailable' } }),
      importFolder: async () => ({ ok: false, error: { code: 'cancelled' } }),
      remove: async () => ({ ok: true, data: [] }),
      getCustomStyles: async () => ({ ok: true, data: '' }),
      setCustomStyles: async (css) => ({ ok: true, data: css }),
      onCustomStylesChanged: () => () => {},
    },
    onBeforeClose: () => () => {},
    links: { openExternal: async () => success(true) },
    library: {
      get: async () => success(emptyLibrary),
      createNotebook: async () => failure('unavailable'),
      setNotebookIcon: async () => failure('unavailable'),
    },
    preferences: {
      get: async () =>
        success({
          preferences,
          styleNonce: 'testNonce012345678901234567890123',
          platform: 'linux',
        }),
      update: async (patch) => {
        preferences = { ...preferences, ...patch };
        return success(preferences);
      },
    },
    notes: {
      create: async () => failure('unavailable'),
      update: async () => failure('unavailable'),
      list: async () => failure('unavailable'),
      search: async () => failure('unavailable'),
      moveToTrash: async () => failure('unavailable'),
      restore: async () => failure('unavailable'),
      ...overrides,
    },
    onNoteChanged(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    api,
    get listenerCount() {
      return listeners.size;
    },
    emitNoteChanged(event: NoteChangedEvent) {
      for (const listener of listeners) listener(event);
    },
  };
}
