import { copyFile, lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'out', 'qa');
await mkdir(output, { recursive: true });
const copied = [];
for (const name of await readdir(tmpdir())) {
  if (!/^inknote-(?:electron|layout)-smoke-[A-Za-z0-9]+$/.test(name)) continue;
  const source = path.join(tmpdir(), name);
  if (!(await lstat(source)).isDirectory()) continue;
  for (const file of await readdir(source)) {
    if (!/\.png$|^(?:theme-audit|layout-audit|scale-qa)\.json$/.test(file))
      continue;
    if (!(await lstat(path.join(source, file))).isFile()) continue;
    const destination = path.join(output, 'profiles', name);
    await mkdir(destination, { recursive: true });
    await copyFile(path.join(source, file), path.join(destination, file));
    copied.push(path.relative(output, path.join(destination, file)));
  }
}
await writeFile(
  path.join(output, 'evidence-index.json'),
  JSON.stringify(
    {
      platform: process.platform,
      arch: process.arch,
      files: copied,
    },
    null,
    2,
  ),
);
console.log(`Collected ${copied.length} QA screenshots and result files.`);
