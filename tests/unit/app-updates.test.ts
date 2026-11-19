import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  createUpdateChecker,
  fetchLatestRelease,
  updateDownloadUrl,
} from '../../src/main/app-updates';

const page = 'https://github.com/craftxdog/InkNotePlus/releases/tag/v2.0.0';
const asset = (name: string) => ({
  name,
  browser_download_url: `https://github.com/craftxdog/InkNotePlus/releases/download/v2.0.0/${name}`,
});
const release = {
  tag_name: 'v2.0.0',
  html_url: page,
  assets: [
    asset('InkNote-2.0.0-macos-arm64.dmg'),
    asset('InkNote-2.0.0-macos-x64.dmg'),
    asset('InkNote-2.0.0-windows-x64-setup.exe'),
    asset('InkNote-2.0.0-linux-x64.deb'),
    asset('InkNote-2.0.0-linux-x64.rpm'),
    asset('SHA256SUMS'),
  ],
};
const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('versions', () => {
  it.each([
    ['1.4.0', '1.4.0', 0],
    ['1.4.1', '1.4.0', 1],
    ['1.9.0', '1.10.0', -1],
    ['2.0.0', '1.99.99', 1],
  ])('compares %s with %s', (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });
});

describe('latest release', () => {
  it('reads the published version without sending personal data', async () => {
    const fetcher = respond(release);
    await expect(fetchLatestRelease(fetcher)).resolves.toMatchObject({
      version: '2.0.0',
      page,
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://api.github.com/repos/craftxdog/InkNotePlus/releases/latest',
    );
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
  });
  it.each([
    ['an error response', respond(release, 500)],
    ['an invalid version', respond({ ...release, tag_name: 'latest' })],
    [
      'a foreign page',
      respond({ ...release, html_url: 'https://evil.test/x' }),
    ],
    ['an unexpected body', respond({ message: 'rate limited' })],
  ])('ignores %s', async (_name, fetcher) => {
    await expect(fetchLatestRelease(fetcher)).resolves.toBeNull();
  });
  it('survives network failures', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(fetchLatestRelease(fetcher)).resolves.toBeNull();
  });
  it('drops downloads hosted outside the project releases', async () => {
    const latest = await fetchLatestRelease(
      respond({
        ...release,
        assets: [
          {
            name: 'InkNote-2.0.0-macos-arm64.dmg',
            browser_download_url: 'https://evil.test/a.dmg',
          },
        ],
      }),
    );
    expect(updateDownloadUrl(latest!, 'darwin', 'arm64')).toBe(page);
  });
});

describe('download for this computer', () => {
  it.each([
    ['darwin', 'arm64', 'InkNote-2.0.0-macos-arm64.dmg'],
    ['darwin', 'x64', 'InkNote-2.0.0-macos-x64.dmg'],
    ['win32', 'x64', 'InkNote-2.0.0-windows-x64-setup.exe'],
  ] as const)('picks the installer for %s %s', async (platform, arch, name) => {
    const latest = await fetchLatestRelease(respond(release));
    expect(updateDownloadUrl(latest!, platform, arch)).toBe(
      asset(name).browser_download_url,
    );
  });
  it('sends Linux to the release page, where the package type can be chosen', async () => {
    const latest = await fetchLatestRelease(respond(release));
    expect(updateDownloadUrl(latest!, 'linux', 'x64')).toBe(page);
  });
});

describe('update checker', () => {
  afterEach(() => vi.useRealTimers());
  function setup(overrides = {}) {
    const options = {
      currentVersion: '1.4.0',
      platform: 'darwin' as NodeJS.Platform,
      arch: 'arm64',
      fetcher: respond(release),
      isEnabled: () => true,
      getSkippedVersion: vi.fn((): string | null => null),
      skipVersion: vi.fn(),
      openDownload: vi.fn(async () => {}),
      prompt: vi.fn(
        async (): Promise<'download' | 'later' | 'skip'> => 'later',
      ),
      notify: vi.fn(async () => {}),
      ...overrides,
    };
    return { options, checker: createUpdateChecker(options) };
  }
  it('offers a newer version and opens its download', async () => {
    const { checker, options } = setup({
      prompt: vi.fn(async () => 'download'),
    });
    await checker.check();
    expect(options.prompt).toHaveBeenCalledWith('2.0.0', '1.4.0');
    expect(options.openDownload).toHaveBeenCalledWith(
      asset('InkNote-2.0.0-macos-arm64.dmg').browser_download_url,
    );
  });
  it('remembers a skipped version for automatic checks only', async () => {
    const { checker, options } = setup({
      prompt: vi.fn(async () => 'skip'),
      getSkippedVersion: () => '2.0.0',
    });
    await checker.check();
    expect(options.prompt).not.toHaveBeenCalled();
    await checker.check({ manual: true });
    expect(options.prompt).toHaveBeenCalledTimes(1);
    expect(options.skipVersion).toHaveBeenCalledWith('2.0.0');
  });
  it('stays quiet when automatic checks find nothing or fail', async () => {
    const current = setup({ currentVersion: '2.0.0' });
    await current.checker.check();
    const failing = setup({ fetcher: respond({}, 500) });
    await failing.checker.check();
    expect(current.options.prompt).not.toHaveBeenCalled();
    expect(current.options.notify).not.toHaveBeenCalled();
    expect(failing.options.notify).not.toHaveBeenCalled();
  });
  it('answers a manual check in every case', async () => {
    const current = setup({ currentVersion: '2.0.0' });
    await current.checker.check({ manual: true });
    expect(current.options.notify).toHaveBeenCalledWith('current');
    const failing = setup({ fetcher: respond({}, 500) });
    await failing.checker.check({ manual: true });
    expect(failing.options.notify).toHaveBeenCalledWith('failed');
  });
  it('checks after startup and daily while enabled, and stops when disposed', async () => {
    vi.useFakeTimers();
    let enabled = true;
    const { checker, options } = setup({ isEnabled: () => enabled });
    checker.start();
    expect(options.fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(options.fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(options.fetcher).toHaveBeenCalledTimes(2);
    enabled = false;
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(options.fetcher).toHaveBeenCalledTimes(2);
    enabled = true;
    checker.dispose();
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(options.fetcher).toHaveBeenCalledTimes(2);
  });
});
