import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  safeFileSegment,
  verifyMacDmgImage,
  verifyMacDmgLayout,
} from './lib/macos-dmg.mjs';

if (process.platform !== 'darwin')
  throw new Error('DMG installation verification requires macOS.');
const arch = process.argv[2] ?? process.arch;
if (!['arm64', 'x64'].includes(arch)) throw new Error('Expected arm64 or x64.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const productName = safeFileSegment(metadata.productName, 'productName');
const version = safeFileSegment(metadata.version, 'version');
const image = path.join(
  root,
  'out',
  'make',
  'dmg',
  arch,
  `${productName}-${version}-${arch}.dmg`,
);
const temporary = await mkdtemp(path.join(tmpdir(), 'inknote-install-'));
const mount = path.join(temporary, 'volume');
const applications = path.join(temporary, 'Applications');
const app = path.join(applications, `${productName}.app`);
let mounted = false;
const probe = spawnSync(
  '/usr/sbin/diskutil',
  ['image', 'create', 'from', '--help'],
  { encoding: 'utf8' },
);
const modern = probe.status === 0 && probe.stdout.includes('--volumeName');
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${path.basename(command)} failed (${result.status}).`,
  );
}
try {
  await verifyMacDmgImage(image, root);
  if (modern)
    run('/usr/sbin/diskutil', [
      'image',
      'attach',
      '--readOnly',
      '--mountOptions',
      'nobrowse',
      '--mountPoint',
      mount,
      image,
    ]);
  else
    run('/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-mountpoint',
      mount,
      image,
    ]);
  mounted = true;
  await verifyMacDmgLayout(mount, productName);
  await mkdir(applications);
  run('/usr/bin/ditto', [path.join(mount, `${productName}.app`), app]);
  const resources = path.join(app, 'Contents', 'Resources');
  const iconName = spawnSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print CFBundleIconFile', path.join(app, 'Contents', 'Info.plist')],
    { encoding: 'utf8' },
  );
  assert.equal(iconName.status, 0, 'The installed app must declare its icon.');
  const iconFile = iconName.stdout.trim();
  assert.deepEqual(
    await readFile(
      path.join(
        resources,
        iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`,
      ),
    ),
    await readFile(path.join(root, 'assets', 'icon.icns')),
    'Finder must use the provided InkNote icon.',
  );
  assert.deepEqual(
    await readFile(path.join(resources, 'icon.png')),
    await readFile(path.join(root, 'assets', 'icon.png')),
    'The runtime icon must match the provided PNG.',
  );
  run('/usr/bin/lipo', [
    path.join(app, 'Contents', 'MacOS', productName),
    '-verify_arch',
    arch === 'x64' ? 'x86_64' : 'arm64',
  ]);
  run('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    app,
  ]);
  if (process.argv.includes('--smoke'))
    run(process.execPath, [
      path.join(root, 'scripts', 'smoke-electron.mjs'),
      `--app-path=${app}`,
      ...(arch !== process.arch ? ['--emulated'] : []),
    ]);
  console.log(
    `Instalación DMG ${arch} verificada: imagen íntegra, acceso Aplicaciones, arquitectura y firma válidas${process.argv.includes('--smoke') ? ', arranque y editor comprobados' : ''}.`,
  );
} finally {
  if (mounted) {
    try {
      if (modern) run('/usr/sbin/diskutil', ['eject', mount]);
      else run('/usr/bin/hdiutil', ['detach', mount]);
      mounted = false;
    } catch (error) {
      // Keep the primary test failure and leave a still-mounted volume intact.
      console.error(`Could not eject the test volume at ${mount}:`, error);
      process.exitCode = 1;
    }
  }
  if (!mounted) await rm(temporary, { recursive: true, force: true });
}
