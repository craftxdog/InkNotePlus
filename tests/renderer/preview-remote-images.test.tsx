// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success } from '../../src/shared/ipc';
import {
  defaultPreferences,
  preferencesSchema,
} from '../../src/shared/preferences';
import { createApi, firstNote } from '../support/renderer-api';
import { createContentSecurityPolicy } from '../../src/main/security';

afterEach(cleanup);
const remote = 'https://images.example.com/foto.png';

function mount(
  body: string,
  preferences: Partial<typeof defaultPreferences> = {},
) {
  let saved = { ...defaultPreferences, ...preferences };
  const { api } = createApi({
    list: async () => success([{ ...firstNote, body }]),
  });
  // The app reads saved preferences when it starts.
  api.preferences.get = async () =>
    success({
      preferences: saved,
      styleNonce: 'testNonce012345678901234567890123',
      platform: 'linux',
    });
  api.preferences.update = async (patch) => {
    saved = { ...saved, ...patch };
    return success(saved);
  };
  const store = createWorkspaceStore(api);
  return { store, ...render(<App store={store} />) };
}
const preview = (container: HTMLElement) => ({
  images: () => [
    ...container.querySelectorAll<HTMLImageElement>('.mde-preview img'),
  ],
  notice: () =>
    container.querySelector('.mde-preview .blocked-image')?.textContent ?? '',
});

describe('remote images', () => {
  it('stays blocked by default and names the site', async () => {
    const { container } = mount(`![Foto](${remote})`);
    await waitFor(() =>
      expect(preview(container).notice()).toContain('images.example.com'),
    );
    expect(preview(container).images()).toEqual([]);
  });

  it('loads the images of one note after the user allows it', async () => {
    const { container, store } = mount(`![Foto](${remote})`);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Mostrar imágenes de esta nota',
      }),
    );
    await waitFor(() => expect(preview(container).images()).toHaveLength(1));
    const image = preview(container).images()[0];
    expect(image.getAttribute('src')).toBe(remote);
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(store.getState().preferences.remoteImageNotes).toContain(
      firstNote.id,
    );
  });

  it('loads every remote image when allowed globally', async () => {
    const { container } = mount(`![Foto](${remote})`, {
      remoteImages: 'allowed',
    });
    await waitFor(() => expect(preview(container).images()).toHaveLength(1));
  });

  it('keeps unencrypted http images blocked even when allowed', async () => {
    const { container } = mount('![Foto](http://images.example.com/a.png)', {
      remoteImages: 'allowed',
    });
    await waitFor(() =>
      expect(preview(container).notice()).toContain('sin cifrar'),
    );
    expect(preview(container).images()).toEqual([]);
  });

  it('defaults existing profiles to blocked', () => {
    expect(preferencesSchema.parse({})).toMatchObject({
      remoteImages: 'blocked',
      remoteImageNotes: [],
    });
  });

  it('lets the page policy load https images only', () => {
    const policy = createContentSecurityPolicy(false);
    expect(policy).toMatch(/img-src [^;]*https:/);
    expect(policy).not.toMatch(/img-src [^;]*http:(?!\/)/);
  });
});
