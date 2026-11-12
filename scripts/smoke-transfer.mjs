import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { build } from 'vite';
import { isExternalForNativeQa } from './qa-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'out'), { recursive: true });
const output = await mkdtemp(path.join(root, 'out', 'transfer-qa-'));
// Compile the real production functions into an isolated Electron main entry.
// https://vite.dev/guide/api-javascript.html#build
await build({
  root,
  configFile: false,
  publicDir: false,
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    target: 'node24',
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: path.join(root, 'tests/native/transfer-smoke.ts'),
      formats: ['es'],
      fileName: () => 'transfer-main.mjs',
    },
    rolldownOptions: { external: isExternalForNativeQa },
  },
});
const child = spawn(electron, [path.join(output, 'transfer-main.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill();
}, 60_000);
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', resolve);
});
clearTimeout(timer);
assert.equal(
  timedOut,
  false,
  'The native transfer check must finish before its timeout.',
);
assert.equal(
  code,
  0,
  'The real Electron backup/export/PDF workflow must pass.',
);
const result = JSON.parse(
  await readFile(path.join(output, 'result.json'), 'utf8'),
);
assert.equal(result.sqlite, 'ok');
assert(result.pages >= 1 && result.pdfBytes > 1000);
console.log(`Transfer QA evidence: ${output}`);
