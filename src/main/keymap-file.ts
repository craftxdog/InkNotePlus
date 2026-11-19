import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';
import { parseKeymap, type KeymapFile } from '../shared/keymap-file';

const fileName = 'keymap.json';
const maxBytes = 256 * 1024;

export function createKeymapFile(options: {
  directory: string;
  onChange: (file: KeymapFile) => void;
  delay?: number;
}) {
  const target = path.join(options.directory, fileName);
  let watcher: FSWatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function read(): KeymapFile {
    let text: string;
    try {
      text = readFileSync(target, 'utf8');
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      return {
        path: target,
        entries: [],
        errors: missing ? [] : ['No se pudo leer keymap.json.'],
      };
    }
    if (Buffer.byteLength(text) > maxBytes)
      return {
        path: target,
        entries: [],
        errors: ['keymap.json supera el tamaño máximo de 256 KB.'],
      };
    return { path: target, ...parseKeymap(text) };
  }

  return {
    read,
    ensure() {
      if (!existsSync(target)) writeFileSync(target, '{}\n', { flag: 'wx' });
      return target;
    },
    // Editors replace files on save, so the folder is watched instead of the file.
    start() {
      watcher = watch(options.directory, (_event, name) => {
        if (name !== fileName) return;
        clearTimeout(timer);
        timer = setTimeout(
          () => options.onChange(read()),
          options.delay ?? 150,
        );
      });
      watcher.on('error', () => watcher?.close());
    },
    dispose() {
      clearTimeout(timer);
      watcher?.close();
    },
  };
}
