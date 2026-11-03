import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
const productName = readSafeFileSegment(
  packageMetadata.productName,
  'productName',
);
const version = readSafeFileSegment(packageMetadata.version, 'version');
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
run('/usr/bin/hdiutil', [
  'create',
  '-volname',
  productName,
  '-srcfolder',
  appBundle,
  '-ov',
  '-format',
  'UDZO',
  outputPath,
]);

function readSafeFileSegment(value, field) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    throw new Error(`package.json ${field} must be a safe file segment.`);
  }

  return value;
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
