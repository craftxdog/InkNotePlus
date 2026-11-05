import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  createReadStream,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  safeFileSegment,
  stageMacDmg,
  verifyMacDmgLayout,
} from './lib/macos-dmg.mjs';

const supportedArchitectures = new Set(['arm64', 'x64']);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const arch = process.argv[2];

if (process.platform !== 'darwin') {
  throw new Error('macOS DMG creation requires macOS.');
}
if (!supportedArchitectures.has(arch)) {
  throw new Error('Supported macOS architectures are arm64 and x64.');
}

const packageMetadata = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
);
const productName = safeFileSegment(packageMetadata.productName, 'productName');
const version = safeFileSegment(packageMetadata.version, 'version');
const forgeCli = path.join(
  projectRoot,
  'node_modules',
  '@electron-forge',
  'cli',
  'dist',
  'electron-forge.js',
);
const appBundle = path.join(
  projectRoot,
  'out',
  `${productName}-darwin-${arch}`,
  `${productName}.app`,
);
const outputDirectory = path.join(projectRoot, 'out', 'make', 'dmg', arch);
const outputPath = path.join(
  outputDirectory,
  `${productName}-${version}-${arch}.dmg`,
);

run(process.execPath, [
  forgeCli,
  'package',
  '--platform=darwin',
  `--arch=${arch}`,
]);

if (!existsSync(appBundle)) {
  throw new Error(
    'Electron Forge did not produce the expected macOS application bundle.',
  );
}
mkdirSync(outputDirectory, { mode: 0o700, recursive: true });
run('/usr/bin/codesign', [
  '--verify',
  '--deep',
  '--strict',
  '--verbose=2',
  appBundle,
]);
const temporary = mkdtempSync(path.join(outputDirectory, '.build-'));
try {
  const stage = path.join(temporary, productName);
  await stageMacDmg(appBundle, stage, productName);
  await verifyMacDmgLayout(stage, productName);
  const image = path.join(temporary, `${productName}.dmg`);
  const probe = spawnSync(
    '/usr/sbin/diskutil',
    ['image', 'create', 'from', '--help'],
    { encoding: 'utf8' },
  );
  if (probe.status === 0 && probe.stdout.includes('--volumeName')) {
    run('/usr/sbin/diskutil', [
      'image',
      'create',
      'from',
      '--volumeName',
      productName,
      '--format',
      'UDZO',
      stage,
      image,
    ]);
  } else {
    // Older supported macOS runners do not provide diskutil image create.
    run('/usr/bin/hdiutil', [
      'create',
      '-volname',
      productName,
      '-srcfolder',
      stage,
      '-format',
      'UDZO',
      image,
    ]);
  }
  run('/usr/bin/hdiutil', ['verify', image]);
  renameSync(image, outputPath);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(outputPath)) digest.update(chunk);
  await writeFile(
    `${outputPath}.sha256`,
    `${digest.digest('hex')}  ${path.basename(outputPath)}\n`,
  );
  console.log(
    `DMG verificado: ${outputPath}\nInstalación: arrastra ${productName}.app a Aplicaciones.`,
  );
  if (
    !process.env.INKNOTE_MAC_SIGN_IDENTITY ||
    process.env.INKNOTE_MAC_SIGN_IDENTITY === '-'
  )
    console.log(
      'Firma ad hoc, sin Developer ID ni notarización. macOS puede pedir autorización al abrir la descarga.',
    );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} failed with status ${result.status}.`,
    );
  }
}
