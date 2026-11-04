import { describe, expect, it } from 'vitest';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi, deferred } from '../support/renderer-api';
import type { ThemeResult } from '../../src/shared/themes';

describe('custom styles autosave', () => {
  it('flushes the latest draft after an earlier save and preserves newer edits', async () => {
    const bridge = createApi();
    const pending = deferred<ThemeResult<string>>();
    const writes: string[] = [];
    bridge.api.themes.setCustomStyles = async (css) => {
      writes.push(css);
      return css === 'first' ? pending.promise : { ok: true, data: css };
    };
    const store = createWorkspaceStore(bridge.api);
    store.getState().editCustomStyles('first');
    const saving = store.getState().saveCustomStyles('first');
    store.getState().editCustomStyles('latest');
    const closing = store.getState().flushThemeChanges();
    pending.resolve({ ok: true, data: 'first' });
    await saving;
    expect(await closing).toBe(true);
    expect(writes).toEqual(['first', 'latest']);
    expect(store.getState().customStyles).toBe('latest');
    expect(store.getState().customStylesDraft).toBeNull();
  });
  it('keeps invalid text available when settings close and refuses a successful close flush', async () => {
    const bridge = createApi();
    bridge.api.themes.setCustomStyles = async () => ({
      ok: false,
      error: { code: 'invalid_package' },
    });
    const store = createWorkspaceStore(bridge.api);
    store.getState().editCustomStyles('invalid {');
    store.getState().setSettingsOpen(false);
    expect(await store.getState().flushThemeChanges()).toBe(false);
    expect(store.getState().customStylesDraft).toBe('invalid {');
    expect(store.getState().customStyles).toBe('');
  });
});
