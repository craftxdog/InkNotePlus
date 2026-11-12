import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const provided = process.argv
  .find((argument) => argument.startsWith('--binary='))
  ?.slice('--binary='.length);
const binary =
  provided ??
  (process.platform === 'linux'
    ? '/usr/bin/inknote'
    : path.join(
        root,
        'out',
        `${metadata.productName}-${process.platform}-${process.arch}`,
        ...(process.platform === 'darwin'
          ? [
              `${metadata.productName}.app`,
              'Contents',
              'MacOS',
              metadata.productName,
            ]
          : [`${metadata.productName}.exe`]),
      ));
const checks = [
  ...(!process.argv.includes('--extended-only')
    ? [
        [
          'Application, editor and preview',
          'smoke-electron.mjs',
          `--app-path=${binary}`,
        ],
      ]
    : []),
  ['Backup, restore and native PDF', 'smoke-transfer.mjs'],
  ['Library and Trash flows', 'smoke-library-qa.mjs', `--binary=${binary}`],
  [
    '3000-note load, search and reload',
    'smoke-scale.mjs',
    `--binary=${binary}`,
  ],
  [
    'Themes, contrast, preferences and responsive layout',
    'smoke-system-audit.mjs',
    `--binary=${binary}`,
  ],
];
const results = [];
for (const [name, script, ...args] of checks) {
  console.log(`QA: ${name}`);
  const started = performance.now();
  const child = spawn(
    process.execPath,
    [path.join(root, 'scripts', script), ...args],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, 0, `${name} must pass.`);
  results.push({
    name,
    passed: true,
    durationMs: Math.round(performance.now() - started),
  });
}
const evidence = path.join(root, 'out', 'qa');
await mkdir(evidence, { recursive: true });
await writeFile(
  path.join(evidence, `desktop-${process.platform}-${process.arch}.json`),
  JSON.stringify(
    {
      version: metadata.version,
      platform: process.platform,
      arch: process.arch,
      binary,
      results,
    },
    null,
    2,
  ),
);
console.log('Desktop QA passed:', JSON.stringify(results));
