import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

interface ThemePackage {
  readonly name: string;
  readonly theme: boolean;
  readonly themeAppearance: 'light' | 'dark';
  readonly styleSheets: readonly string[];
  readonly scripts: { readonly prepublishOnly: string };
  readonly devDependencies: Record<string, string>;
  readonly engines: Record<string, string>;
}

interface Palette {
  readonly name: string;
  readonly themeAppearance: 'light' | 'dark';
  readonly themeDevHelpersVersion: string;
  readonly '--page-background': string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('Inkdrop theme development packages', () => {
  it.each(['inknote-light', 'inknote-dark'] as const)(
    '%s follows the documented theme manifest and generated palette contract',
    (themeName) => {
      const themePath = resolve(projectRoot, 'themes', themeName);
      const manifest = readJson<ThemePackage>(
        resolve(themePath, 'package.json'),
      );
      const palette = readJson<Palette>(resolve(themePath, 'palette.json'));

      expect(manifest).toMatchObject({
        name: themeName,
        theme: true,
        themeAppearance: themeName.endsWith('light') ? 'light' : 'dark',
        styleSheets: ['ui.css', 'syntax.css', 'preview.css'],
        scripts: { prepublishOnly: 'generate-palette' },
        devDependencies: { '@inkdropapp/theme-dev-helpers': '^0.7.1' },
        engines: { inkdrop: '^6.0.0', node: '>=24' },
      });
      expect(palette).toMatchObject({
        name: manifest.name,
        themeAppearance: manifest.themeAppearance,
        themeDevHelpersVersion: '0.7.1',
      });
      expect(palette['--page-background']).toBeTruthy();

      expect(
        readFileSync(resolve(themePath, 'styles', 'ui.css'), 'utf8'),
      ).toContain('@layer theme.ui');
      expect(
        readFileSync(resolve(themePath, 'styles', 'syntax.css'), 'utf8'),
      ).toContain('@layer theme.syntax');
      expect(
        readFileSync(resolve(themePath, 'styles', 'preview.css'), 'utf8'),
      ).toContain('@layer theme.preview');
    },
  );
});
