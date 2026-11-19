import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { keystrokeSchema } from '../../shared/keybindings';
import {
  pluginKeymapEntrySchema,
  pluginNameSchema,
  type PluginBundle,
  type PluginInfo,
  type PluginInstallResponse,
  type PluginKeymapEntry,
} from '../../shared/plugins';

const maxFiles = 400;
const maxBytes = 8 * 1024 * 1024;
const codeFile = /\.(?:js|cjs|json)$/;
const initFile = 'init.js';
const initTemplate = `// InkNote ejecuta este archivo al iniciar, sin acceso a Node ni a la red.
// inkdrop.commands.add(document.body, {
//   'init:hola': () => inkdrop.notifications.addInfo('Hola'),
// });
`;

const keyNames: Readonly<Record<string, string>> = {
  enter: 'Enter',
  escape: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};
const modifierNames: Readonly<Record<string, string>> = {
  cmd: 'Mod',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
};

// Inkdrop writes cmd-shift-p, and InkNote stores Mod-Shift-p.
export function convertKeystroke(value: string) {
  const converted = value
    .trim()
    .split(/\s+/)
    .map((stroke) => {
      const parts = stroke.split('-');
      const key = parts.pop() ?? '';
      const name =
        keyNames[key] ?? (/^f\d+$/.test(key) ? key.toUpperCase() : key);
      return [...parts.map((part) => modifierNames[part] ?? '?'), name].join(
        '-',
      );
    })
    .join(' ');
  return !converted.includes('?') &&
    keystrokeSchema.safeParse(converted).success
    ? converted
    : null;
}

function listFiles(root: string) {
  const files: string[] = [];
  const visit = (relative: string) => {
    for (const name of readdirSync(path.join(root, relative))) {
      const child = path.join(relative, name);
      // Symbolic links could expose files from outside the plugin.
      const stat = lstatSync(path.join(root, child));
      if (stat.isDirectory()) {
        if (name !== '.git') visit(child);
      } else if (stat.isFile() && codeFile.test(name))
        files.push(child.split(path.sep).join('/'));
    }
  };
  visit('');
  return files;
}

const readManifest = (root: string) => {
  const parsed = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as Record<string, unknown>;
  const main = path.posix
    .normalize(String(parsed.main ?? 'index.js'))
    .replace(/^\.\//, '');
  return {
    name: String(parsed.name ?? ''),
    version: String(parsed.version ?? '0.0.0').slice(0, 64),
    description: String(parsed.description ?? '').slice(0, 500),
    main: path.posix.extname(main) ? main : `${main}.js`,
  };
};

export function createPluginStore(userData: string) {
  const directory = path.join(userData, 'plugins');
  const init = path.join(userData, initFile);
  const valid = (name: string) =>
    pluginNameSchema.safeParse(name).success && name !== 'init';

  function readKeymap(root: string) {
    const folder = path.join(root, 'keymaps');
    if (!existsSync(folder)) return [];
    const entries: PluginKeymapEntry[] = [];
    for (const file of readdirSync(folder).filter((name) =>
      name.endsWith('.json'),
    )) {
      try {
        const parsed = JSON.parse(
          readFileSync(path.join(folder, file), 'utf8'),
        ) as Record<string, Record<string, unknown>>;
        for (const [selector, bindings] of Object.entries(parsed))
          for (const [keys, command] of Object.entries(bindings)) {
            const keystroke = convertKeystroke(keys);
            const entry = pluginKeymapEntrySchema.safeParse({
              selector,
              keystroke,
              command,
            });
            if (entry.success) entries.push(entry.data);
          }
      } catch {
        // A broken keymap must not stop the plugin from loading.
      }
    }
    return entries.slice(0, 200);
  }

  return {
    list(): PluginInfo[] {
      if (!existsSync(directory)) return [];
      return readdirSync(directory).flatMap((name) => {
        try {
          const manifest = readManifest(path.join(directory, name));
          return manifest.name === name
            ? [
                {
                  name,
                  version: manifest.version,
                  description: manifest.description,
                },
              ]
            : [];
        } catch {
          return [];
        }
      });
    },
    async install(source: string): Promise<PluginInstallResponse> {
      const fail = (message: string) => ({ ok: false as const, message });
      let manifest: ReturnType<typeof readManifest>;
      try {
        manifest = readManifest(source);
      } catch {
        return fail('La carpeta no contiene un package.json válido.');
      }
      if (!valid(manifest.name))
        return fail('El nombre del plugin no es válido.');
      const files = listFiles(source);
      if (manifest.main.startsWith('..') || !files.includes(manifest.main))
        return fail('No se encontró el archivo principal del plugin.');
      const size = files.reduce(
        (total, file) => total + lstatSync(path.join(source, file)).size,
        0,
      );
      if (files.length > maxFiles || size > maxBytes)
        return fail('El plugin supera el tamaño máximo de 8 MB.');
      const target = path.join(directory, manifest.name);
      rmSync(target, { recursive: true, force: true });
      for (const file of files) {
        mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
        cpSync(path.join(source, file), path.join(target, file));
      }
      return { ok: true, name: manifest.name };
    },
    remove(name: string) {
      if (valid(name))
        rmSync(path.join(directory, name), { recursive: true, force: true });
    },
    load(name: string): PluginBundle | null {
      if (!valid(name)) return null;
      const root = path.join(directory, name);
      if (!existsSync(root)) return null;
      const manifest = readManifest(root);
      const files = Object.fromEntries(
        listFiles(root)
          .filter(
            (file) => !file.startsWith('keymaps/') && file !== 'package.json',
          )
          .map((file) => [file, readFileSync(path.join(root, file), 'utf8')]),
      );
      return { name, main: manifest.main, files, keymap: readKeymap(root) };
    },
    ensureInit() {
      if (!existsSync(init)) writeFileSync(init, initTemplate, { flag: 'wx' });
      return init;
    },
    loadInit(): PluginBundle | null {
      if (!existsSync(init)) return null;
      return {
        name: 'init',
        main: initFile,
        files: { [initFile]: readFileSync(init, 'utf8') },
        keymap: [],
      };
    },
  };
}
