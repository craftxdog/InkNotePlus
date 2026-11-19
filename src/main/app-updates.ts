import { z } from '../shared/validation';

const releasesPage = 'https://github.com/craftxdog/InkNotePlus/releases/';
const latestReleaseApi =
  'https://api.github.com/repos/craftxdog/InkNotePlus/releases/latest';
const startupDelay = 15_000;
const checkInterval = 24 * 60 * 60 * 1000;

const isProjectRelease = (url: string) => url.startsWith(releasesPage);
const releaseSchema = z.object({
  tag_name: z.string().regex(/^v?\d+\.\d+\.\d+$/),
  html_url: z.string().refine(isProjectRelease),
  assets: z.array(
    z.object({ name: z.string(), browser_download_url: z.string() }),
  ),
});

export interface LatestRelease {
  version: string;
  page: string;
  assets: { name: string; url: string }[];
}

export function compareVersions(left: string, right: string) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export async function fetchLatestRelease(
  fetcher: typeof fetch,
): Promise<LatestRelease | null> {
  try {
    const response = await fetcher(latestReleaseApi, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'InkNote',
      },
    });
    if (!response.ok) return null;
    const release = releaseSchema.safeParse(await response.json());
    if (!release.success) return null;
    return {
      version: release.data.tag_name.replace(/^v/, ''),
      page: release.data.html_url,
      assets: release.data.assets
        .filter(({ browser_download_url: url }) => isProjectRelease(url))
        .map(({ name, browser_download_url: url }) => ({ name, url })),
    };
  } catch {
    return null;
  }
}

// Linux has two package types, so its users choose on the release page.
export function updateDownloadUrl(
  release: LatestRelease,
  platform: NodeJS.Platform,
  arch: string,
) {
  const suffix =
    platform === 'darwin'
      ? `-macos-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
      : platform === 'win32'
        ? '-windows-x64-setup.exe'
        : null;
  const asset =
    suffix && release.assets.find(({ name }) => name.endsWith(suffix));
  return asset ? asset.url : release.page;
}

// Releases are not code signed, which the native updater requires, so InkNote
// announces a new version and leaves the installation to the user.
export function createUpdateChecker(options: {
  currentVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  fetcher: typeof fetch;
  isEnabled: () => boolean;
  getSkippedVersion: () => string | null;
  skipVersion: (version: string) => void;
  openDownload: (url: string) => Promise<void>;
  prompt: (
    version: string,
    current: string,
  ) => Promise<'download' | 'later' | 'skip'>;
  notify: (result: 'current' | 'failed') => Promise<void>;
}) {
  let checking = false;
  let delay: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;

  async function check({ manual = false } = {}) {
    if (checking) return;
    checking = true;
    try {
      const release = await fetchLatestRelease(options.fetcher);
      if (!release) {
        if (manual) await options.notify('failed');
        return;
      }
      if (compareVersions(release.version, options.currentVersion) <= 0) {
        if (manual) await options.notify('current');
        return;
      }
      if (!manual && options.getSkippedVersion() === release.version) return;
      const choice = await options.prompt(
        release.version,
        options.currentVersion,
      );
      if (choice === 'skip') options.skipVersion(release.version);
      if (choice === 'download')
        await options.openDownload(
          updateDownloadUrl(release, options.platform, options.arch),
        );
    } finally {
      checking = false;
    }
  }
  const tick = () => {
    if (options.isEnabled()) void check();
  };
  return {
    check,
    start() {
      delay = setTimeout(() => {
        tick();
        interval = setInterval(tick, checkInterval);
        interval.unref?.();
      }, startupDelay);
      delay.unref?.();
    },
    dispose() {
      clearTimeout(delay);
      clearInterval(interval);
    },
  };
}
