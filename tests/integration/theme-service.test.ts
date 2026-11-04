import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ThemeService } from '../../src/main/themes/theme-service';
import { readAsset } from '../../src/main/asset-protocol';
import { validateThemeCss } from '../../src/main/themes/theme-files';
import { create } from 'tar';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  root = await mkdtemp(path.join(tmpdir(), 'inknote-themes-test-'));
  const source = path.join(root, 'source');
  const data = path.join(root, 'data');
  await mkdir(path.join(source, 'styles'), { recursive: true });
  await mkdir(data);
  await writeFile(
    path.join(source, 'package.json'),
    JSON.stringify({
      name: 'test-theme',
      version: '1.0.0',
      theme: true,
      themeAppearance: 'dark',
      styleSheets: ['tokens.css', 'ui.css'],
      scripts: { install: 'must never execute' },
    }),
  );
  await writeFile(
    path.join(source, 'styles', 'tokens.css'),
    '@layer theme { :root { --sample: red; } }',
  );
  await writeFile(
    path.join(source, 'styles', 'ui.css'),
    '@layer theme.ui { :root { --text-color: var(--sample); } }',
  );
  return { source, data, service: new ThemeService(data) };
}
describe('theme packages', () => {
  it('installs a registry archive and rejects links inside it', async () => {
    const { source, service } = await fixture();
    const archive = path.join(root, 'theme.tgz');
    await create({ cwd: root, file: archive, gzip: true }, ['source']);
    const theme = await service.importTarball(
      await readFile(archive),
      'test-theme',
    );
    expect(theme.manifest.name).toBe('test-theme');
    await symlink(
      path.join(source, 'package.json'),
      path.join(source, 'styles', 'linked.css'),
    );
    await create({ cwd: root, file: archive, gzip: true }, ['source']);
    await expect(
      service.importTarball(await readFile(archive), 'test-theme'),
    ).rejects.toThrow();
    expect(await service.list()).toHaveLength(1);
  });
  it('copies ordered CSS without executing code and serves only restricted assets', async () => {
    const { source, data, service } = await fixture();
    const theme = await service.importFolder(source);
    expect(theme.manifest.styleSheets).toEqual(['tokens.css', 'ui.css']);
    expect(await service.list()).toEqual([theme]);
    const response = await readAsset(theme.styles[0], data);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('--sample: red');
    expect(
      (
        await readAsset(
          'inknote-asset://themes/test-theme/installed.json',
          data,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await readAsset(
          'inknote-asset://themes/test-theme/%2e%2e%2fsource/package.json',
          data,
        )
      ).status,
    ).toBe(404);
    await service.remove('test-theme');
    expect(await service.list()).toEqual([]);
  });
  it('rejects symlinks, missing styles and legacy packages', async () => {
    const { source, service } = await fixture();
    await symlink(
      path.join(source, 'package.json'),
      path.join(source, 'styles', 'leak.css'),
    );
    await expect(service.importFolder(source)).rejects.toThrow();
    await rm(path.join(source, 'styles', 'leak.css'));
    const file = path.join(source, 'package.json');
    const raw = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...raw, theme: 'ui' }));
    await expect(service.importFolder(source)).rejects.toThrow('incompatible');
    await writeFile(
      file,
      JSON.stringify({ ...raw, styleSheets: ['missing.css'] }),
    );
    await expect(service.importFolder(source)).rejects.toThrow(
      'invalid_package',
    );
  });
  it('persists safe custom CSS atomically and keeps prior styles on invalid input', async () => {
    const { service } = await fixture();
    await service.writeStyles(':root { --text-color: red; }');
    await expect(
      service.writeStyles('@import "https://example.com/track.css";'),
    ).rejects.toThrow();
    expect(await service.readStyles()).toContain('--text-color: red');
    for (const value of [
      'a { background: url(https://example.com/x) }',
      'a { background: url(file:///etc/passwd) }',
    ])
      expect(() => validateThemeCss(value)).toThrow();
  });
});
