// Builds out/portable/InkNote-<version>-linux-<arch>.AppImage on Linux.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  appImageName,
  appImageTools,
  appRunScript,
  desktopEntry,
} from './lib/appimage.mjs';

const arch = process.argv[2];
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const name = appImageName(version, arch);
const tools = appImageTools[arch];
if (process.platform !== 'linux') throw new Error('AppImages build on Linux.');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
}

async function download({ url, sha256 }, target) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256)
    throw new Error(`${url}: expected SHA-256 ${sha256}, got ${actual}`);
  writeFileSync(target, bytes, { mode: 0o755 });
}

// 1. Package the app with the same Forge configuration as the installers.
run(process.execPath, [
  path.join(
    'node_modules',
    '@electron-forge',
    'cli',
    'dist',
    'electron-forge.js',
  ),
  'package',
  '--platform=linux',
  `--arch=${arch}`,
]);
const packaged = path.join('out', `InkNote-linux-${arch}`);
if (!existsSync(path.join(packaged, 'InkNote')))
  throw new Error(`No packaged app in ${packaged}`);

// 2. Lay out the AppDir: AppRun, desktop entry and icon at its root.
const work = mkdtempSync(path.join(tmpdir(), 'inknote-appimage-'));
const appDir = path.join(work, 'InkNote.AppDir');
const lib = path.join(appDir, 'usr', 'lib', 'inknote');
mkdirSync(path.dirname(lib), { recursive: true });
run('cp', ['-a', packaged, lib]);
// The setuid helper cannot keep its mode inside the image; AppRun decides.
rmSync(path.join(lib, 'chrome-sandbox'), { force: true });
writeFileSync(path.join(appDir, 'AppRun'), appRunScript(), { mode: 0o755 });
writeFileSync(path.join(appDir, 'inknote.desktop'), desktopEntry());
const icon = path.join('assets', 'icons', '512x512.png');
copyFileSync(icon, path.join(appDir, 'inknote.png'));
copyFileSync(icon, path.join(appDir, '.DirIcon'));
const hicolor = path.join(
  appDir,
  'usr',
  'share',
  'icons',
  'hicolor',
  '512x512',
  'apps',
);
mkdirSync(hicolor, { recursive: true });
copyFileSync(icon, path.join(hicolor, 'inknote.png'));

// 3. Build the image offline with the pinned runtime.
const appimagetool = path.join(work, 'appimagetool');
const runtime = path.join(work, 'runtime');
await download(tools.appimagetool, appimagetool);
await download(tools.runtime, runtime);
mkdirSync(path.join('out', 'portable'), { recursive: true });
const target = path.join('out', 'portable', name);
run(
  appimagetool,
  ['--no-appstream', '--runtime-file', runtime, appDir, target],
  {
    // Runners have no FUSE; the tool unpacks itself instead of mounting.
    env: { ...process.env, ARCH: tools.machine, APPIMAGE_EXTRACT_AND_RUN: '1' },
  },
);
chmodSync(target, 0o755);

// 4. Check the result unpacks and contains the app before publishing it.
const check = path.join(work, 'check');
mkdirSync(check);
run(path.resolve(target), ['--appimage-extract'], { cwd: check });
for (const file of ['AppRun', 'inknote.desktop', 'usr/lib/inknote/InkNote'])
  if (!existsSync(path.join(check, 'squashfs-root', file)))
    throw new Error(`The AppImage is missing ${file}`);

const hash = createHash('sha256').update(readFileSync(target)).digest('hex');
writeFileSync(`${target}.sha256`, `${hash}  ${name}\n`);
rmSync(work, { recursive: true, force: true });
console.log(`${target} (${Math.round(statSync(target).size / 1048576)} MB)`);
