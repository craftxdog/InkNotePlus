import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import { themeManifestSchema } from '../../shared/theme-manifest';
import type { InstalledTheme } from '../../shared/themes';

const assetExtensions = new Set([
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);
export function validateThemeCss(css: string): void {
  const root = postcss.parse(css);
  root.walkAtRules((rule) => {
    if (rule.name.toLowerCase() === 'import' || rule.name.includes('\\'))
      throw new Error('invalid_package');
  });
  root.walkDecls((rule) => {
    // Local relative assets only. CSP separately blocks network access and script execution.
    if (/url\s*\(/i.test(rule.value)) {
      for (const match of rule.value.matchAll(/url\s*\(([^)]*)\)/gi)) {
        const value = match[1].trim().replace(/^['"]|['"]$/g, '');
        if (
          !/^[a-zA-Z0-9_./-]+$/.test(value) ||
          value.startsWith('/') ||
          !assetExtensions.has(path.extname(value))
        )
          throw new Error('invalid_package');
      }
    }
    if (rule.value.includes('\\')) throw new Error('invalid_package');
  });
}

export async function importThemeFolder(
  source: string,
  themesRoot: string,
): Promise<InstalledTheme> {
  const root = await realpath(source);
  const manifestPath = path.join(root, 'package.json');
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > 100_000)
    throw new Error('invalid_package');
  const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (raw.theme !== true) throw new Error('incompatible');
  const manifest = themeManifestSchema.parse(raw);
  if (manifest.name.startsWith('inknote-')) throw new Error('invalid_package');
  const files = new Map<string, Uint8Array>();
  let bytes = 0;
  let entries = 0;
  async function visit(directory: string, prefix = '') {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 1024) throw new Error('invalid_package');
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      if (!/^[a-zA-Z0-9_.-]+$/.test(item.name)) continue;
      const relative = `${prefix}${item.name}`;
      if (relative.split('/').length > 12 || item.isSymbolicLink())
        throw new Error('invalid_package');
      if (item.isDirectory()) {
        await visit(path.join(directory, item.name), `${relative}/`);
        continue;
      }
      if (
        !item.isFile() ||
        (!assetExtensions.has(path.extname(item.name)) &&
          item.name !== 'package.json' &&
          item.name !== 'palette.json' &&
          !/^licen[sc]e/i.test(item.name))
      )
        continue;
      const filePath = path.join(directory, item.name);
      const stat = await lstat(filePath);
      if (
        !stat.isFile() ||
        stat.size > 5_000_000 ||
        (bytes += stat.size) > 30_000_000 ||
        files.size >= 256
      )
        throw new Error('invalid_package');
      const contents = await readFile(filePath);
      if (path.extname(relative) === '.css')
        validateThemeCss(contents.toString('utf8'));
      files.set(relative, contents);
    }
  }
  await visit(root);
  for (const file of manifest.styleSheets)
    if (!files.has(`styles/${file}`)) throw new Error('invalid_package');
  const digest = createHash('sha256');
  for (const [file, contents] of [...files].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    digest.update(file).update(contents);
  const revision = `${manifest.version}-${digest.digest('hex').slice(0, 16)}`;
  const target = path.join(themesRoot, manifest.name, revision);
  await mkdir(target, { recursive: true });
  for (const [relative, contents] of files) {
    await mkdir(path.dirname(path.join(target, relative)), { recursive: true });
    await writeFile(path.join(target, relative), contents);
  }
  const result: InstalledTheme = {
    manifest,
    label: manifest.name,
    source: 'installed',
    styles: manifest.styleSheets.map(
      (file) =>
        `inknote-asset://themes/${manifest.name}/${revision}/styles/${file}`,
    ),
  };
  const installedPath = path.join(themesRoot, manifest.name, 'installed.json');
  await writeFile(`${installedPath}.tmp`, JSON.stringify(result), 'utf8');
  await rename(`${installedPath}.tmp`, installedPath);
  return result;
}
