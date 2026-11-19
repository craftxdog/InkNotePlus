import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { portableName } from './lib/portable.mjs';

const [platform, arch] = process.argv.slice(2);
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const name = portableName(version, platform, arch);
const forge = path.join(
  'node_modules',
  '@electron-forge',
  'cli',
  'dist',
  'electron-forge.js',
);
const result = spawnSync(
  process.execPath,
  [
    forge,
    'make',
    `--platform=${platform}`,
    `--arch=${arch}`,
    '--targets=@electron-forge/maker-zip',
  ],
  { stdio: 'inherit', env: { ...process.env, INKNOTE_PORTABLE: '1' } },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const folder = path.join('out', 'make', 'zip', platform, arch);
const archive = readdirSync(folder).find((file) => file.endsWith('.zip'));
if (!archive) throw new Error(`No archive found in ${folder}`);
mkdirSync(path.join('out', 'portable'), { recursive: true });
const target = path.join('out', 'portable', name);
copyFileSync(path.join(folder, archive), target);
const hash = createHash('sha256').update(readFileSync(target)).digest('hex');
writeFileSync(`${target}.sha256`, `${hash}  ${name}\n`);
console.log(`${target} (${Math.round(statSync(target).size / 1048576)} MB)`);
