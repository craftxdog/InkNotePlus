import { describe, expect, it, vi } from 'vitest';
import { ThemeRegistry } from '../../src/main/themes/theme-registry';
import { downloadThemeResource } from '../../src/main/themes/download';

const packageInfo = (name: string, theme: boolean | string = true) => ({
  name,
  downloads: 50,
  releases: { latest: '2.0.0' },
  metadata: { name, version: '2.0.0', description: 'Published theme', theme },
});
describe('official package registry adapter', () => {
  it('follows a validated HTTPS storage redirect without forwarding registry headers', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://storage.example.com/theme.tgz' },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    expect(
      await downloadThemeResource(
        fetcher,
        'https://api.inkdrop.app/v2/packages/theme/versions/1.0.0/tarball',
        100,
      ),
    ).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://storage.example.com/theme.tgz',
      expect.objectContaining({
        redirect: 'manual',
        credentials: 'omit',
        headers: {},
      }),
    );
  });
  it('uses the documented ipm v2 listing and download routes and filters non-themes', async () => {
    const download = vi.fn(async (url: string) =>
      new TextEncoder().encode(
        JSON.stringify(
          url.includes('?')
            ? [
                packageInfo('unified'),
                packageInfo('legacy', 'ui'),
                packageInfo('plugin', false),
              ]
            : packageInfo('unified'),
        ),
      ),
    );
    const registry = new ThemeRegistry(download);
    const themes = await registry.browse({});
    expect(themes.map((theme) => [theme.name, theme.compatible])).toEqual([
      ['unified', true],
      ['legacy', false],
    ]);
    expect(download).toHaveBeenCalledWith(
      'https://api.inkdrop.app/v2/packages/?theme=1&sort=majority&page=0',
      4_000_000,
    );
    await registry.tarball('unified');
    expect(download).toHaveBeenLastCalledWith(
      'https://api.inkdrop.app/v2/packages/unified/versions/2.0.0/tarball',
      20_000_000,
    );
  });
  it('rejects network redirects to non-HTTPS or local addresses and bounds payloads', async () => {
    const redirect = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private' },
        }),
    );
    await expect(
      downloadThemeResource(
        redirect,
        'https://api.inkdrop.app/v2/packages/',
        100,
      ),
    ).rejects.toThrow();
    expect(redirect).toHaveBeenCalledTimes(1);
    const large = vi.fn(async () => new Response(new Uint8Array(101)));
    await expect(
      downloadThemeResource(large, 'https://api.inkdrop.app/v2/packages/', 100),
    ).rejects.toThrow();
  });
});
