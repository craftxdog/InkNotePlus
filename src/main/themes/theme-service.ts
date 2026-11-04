import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
  rename,
} from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { extract, type Unpack } from 'tar';
import { importThemeFolder, validateThemeCss } from './theme-files';
import { themePackageSchema, type InstalledTheme } from '../../shared/themes';

export class ThemeService {
  readonly root: string;
  readonly stylesPath: string;
  private watcher: FSWatcher | undefined;
  constructor(private readonly userData: string) {
    this.root = path.join(userData, 'themes');
    this.stylesPath = path.join(userData, 'styles.css');
  }
  async list(): Promise<InstalledTheme[]> {
    await mkdir(this.root, { recursive: true });
    const themes: InstalledTheme[] = [];
    for (const item of await readdir(this.root, { withFileTypes: true })) {
      if (!item.isDirectory() || item.name.startsWith('.')) continue;
      try {
        const theme = themePackageSchema.parse(
          JSON.parse(
            await readFile(
              path.join(this.root, item.name, 'installed.json'),
              'utf8',
            ),
          ),
        );
        if (theme.manifest.name === item.name) themes.push(theme);
      } catch {
        /* A damaged package is omitted; built-in themes remain available. */
      }
    }
    return themes.sort((a, b) => a.label.localeCompare(b.label));
  }
  importFolder(folder: string) {
    return importThemeFolder(folder, this.root);
  }
  async importTarball(bytes: Uint8Array, expectedName: string) {
    await mkdir(this.root, { recursive: true });
    const temporary = await mkdtemp(path.join(this.root, '.import-'));
    try {
      const archive = path.join(temporary, 'theme.tgz');
      const folder = path.join(temporary, 'package');
      await mkdir(folder);
      await writeFile(archive, bytes);
      let entries = 0,
        size = 0;
      await extract({
        file: archive,
        cwd: folder,
        strip: 1,
        strict: true,
        preservePaths: false,
        filter(this: Unpack, name, entry) {
          if (
            ++entries > 1024 ||
            (size += entry.size) > 30_000_000 ||
            entry.size > 5_000_000 ||
            name.split('/').some((part) => part === '..') ||
            name.startsWith('/') ||
            name.includes('\\')
          ) {
            this.abort(new Error('invalid_package'));
            return false;
          }
          if (
            !('type' in entry) ||
            (entry.type !== 'File' && entry.type !== 'Directory')
          ) {
            this.abort(new Error('invalid_package'));
            return false;
          }
          return true;
        },
      });
      const raw = JSON.parse(
        await readFile(path.join(folder, 'package.json'), 'utf8'),
      );
      if (raw.name !== expectedName) throw new Error('invalid_package');
      return await this.importFolder(folder);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  async remove(name: string) {
    await rm(path.join(this.root, name), { recursive: true, force: true });
  }
  async readStyles(): Promise<string> {
    try {
      const value = await readFile(this.stylesPath, 'utf8');
      if (value.length > 100_000) throw new Error('invalid_package');
      validateThemeCss(value);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  }
  async writeStyles(value: string) {
    validateThemeCss(value);
    const temporary = `${this.stylesPath}.tmp`;
    await writeFile(temporary, value, 'utf8');
    await rename(temporary, this.stylesPath);
    return value;
  }
  watchStyles(changed: (value: string) => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.watcher = watch(this.userData, (_event, name) => {
      if (name !== 'styles.css') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void this.readStyles()
          .then(changed)
          .catch(() => {});
      }, 100);
    });
    return {
      dispose: () => {
        clearTimeout(timer);
        this.watcher?.close();
      },
    };
  }
}
