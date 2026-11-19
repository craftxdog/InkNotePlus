import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPluginStore,
  convertKeystroke,
} from '../../src/main/plugins/plugin-store';

const roots: string[] = [];
const temp = () => {
  const value = mkdtempSync(path.join(tmpdir(), 'inknote-plugins-'));
  roots.push(value);
  return value;
};
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);

function plugin(files: Record<string, string>) {
  const folder = temp();
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
    writeFileSync(path.join(folder, name), text);
  }
  return folder;
}
const manifest = (extra: object = {}) =>
  JSON.stringify({
    name: 'mi-plugin',
    version: '1.2.3',
    main: './lib/index.js',
    description: 'Prueba',
    ...extra,
  });

describe('plugin store', () => {
  it('installs and lists a valid plugin without running it', async () => {
    const store = createPluginStore(temp());
    const source = plugin({
      'package.json': manifest(),
      'lib/index.js': 'throw new Error("no debe ejecutarse")',
    });
    expect(await store.install(source)).toEqual({
      ok: true,
      name: 'mi-plugin',
    });
    expect(store.list()).toEqual([
      { name: 'mi-plugin', version: '1.2.3', description: 'Prueba' },
    ]);
  });

  it('bundles code and converts keymaps', async () => {
    const store = createPluginStore(temp());
    await store.install(
      plugin({
        'package.json': manifest(),
        'lib/index.js': 'module.exports = {}',
        'keymaps/a.json': JSON.stringify({
          body: { 'cmd-shift-y': 'mi-plugin:run', 'nada raro!': 'x' },
        }),
      }),
    );
    expect(store.load('mi-plugin')).toMatchObject({
      name: 'mi-plugin',
      main: 'lib/index.js',
      files: { 'lib/index.js': 'module.exports = {}' },
      keymap: [
        {
          selector: 'body',
          keystroke: 'Mod-Shift-y',
          command: 'mi-plugin:run',
        },
      ],
    });
  });

  it.each([
    ['a bad name', { name: '../fuera' }],
    ['a reserved name', { name: 'init' }],
    ['a main outside the plugin', { main: '../../secreto.js' }],
    ['a missing main', { main: './no-existe.js' }],
  ])('rejects %s', async (_label, extra) => {
    const store = createPluginStore(temp());
    const result = await store.install(
      plugin({ 'package.json': manifest(extra), 'lib/index.js': '' }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(store.list()).toEqual([]);
  });

  it('rejects a folder without a manifest', async () => {
    const store = createPluginStore(temp());
    expect(await store.install(temp())).toMatchObject({ ok: false });
  });

  it('does not follow symbolic links', async () => {
    const secret = plugin({ 'secreto.js': 'clave' });
    const source = plugin({ 'package.json': manifest(), 'lib/index.js': '' });
    symlinkSync(
      path.join(secret, 'secreto.js'),
      path.join(source, 'lib/enlace.js'),
    );
    const store = createPluginStore(temp());
    await store.install(source);
    expect(Object.keys(store.load('mi-plugin')!.files)).toEqual([
      'lib/index.js',
    ]);
  });

  it('rejects an oversized plugin', async () => {
    const store = createPluginStore(temp());
    const result = await store.install(
      plugin({
        'package.json': manifest(),
        'lib/index.js': 'x'.repeat(9 * 1024 * 1024),
      }),
    );
    expect(result).toMatchObject({ ok: false });
  });

  it('replaces a previous version', async () => {
    const store = createPluginStore(temp());
    await store.install(
      plugin({
        'package.json': manifest(),
        'lib/index.js': 'uno',
        'lib/vieja.js': '',
      }),
    );
    await store.install(
      plugin({
        'package.json': manifest({ version: '2.0.0' }),
        'lib/index.js': 'dos',
      }),
    );
    expect(store.list()[0].version).toBe('2.0.0');
    expect(store.load('mi-plugin')!.files).toEqual({ 'lib/index.js': 'dos' });
  });

  it('removes only the named plugin', async () => {
    const root = temp();
    const store = createPluginStore(root);
    await store.install(
      plugin({ 'package.json': manifest(), 'lib/index.js': '' }),
    );
    store.remove('../mi-plugin');
    expect(store.list()).toHaveLength(1);
    store.remove('mi-plugin');
    expect(store.list()).toEqual([]);
  });

  it('creates init.js once and loads it as a bundle', () => {
    const root = temp();
    const store = createPluginStore(root);
    expect(store.loadInit()).toBeNull();
    const file = store.ensureInit();
    expect(existsSync(file)).toBe(true);
    writeFileSync(file, 'inkdrop.notifications.addInfo("hola")');
    store.ensureInit();
    expect(readFileSync(file, 'utf8')).toContain('hola');
    expect(store.loadInit()).toMatchObject({ name: 'init', main: 'init.js' });
  });
});

describe('convertKeystroke', () => {
  it.each([
    ['cmd-k', 'Mod-k'],
    ['ctrl-shift-p', 'Ctrl-Shift-p'],
    ['alt-enter', 'Alt-Enter'],
    ['cmd-k cmd-b', 'Mod-k Mod-b'],
    ['f5', 'F5'],
  ])('%s becomes %s', (input, output) =>
    expect(convertKeystroke(input)).toBe(output),
  );
  it('rejects unknown keys', () =>
    expect(convertKeystroke('cmd-nada raro!')).toBeNull());
});
