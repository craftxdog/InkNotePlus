import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { resolveShellLayout } from '../../src/renderer/layout/shell-layout';
import { defaultPreferences } from '../../src/shared/preferences';

const stylesheet = readFileSync(
  resolve(process.cwd(), 'src', 'index.css'),
  'utf8',
);

const requiredImports = [
  'layers.css',
  'reset.css',
  'tokens.css',
  'utilities.css',
  'ui.css',
  'status.css',
  'task-progress.css',
  'tags.css',
  'syntax.css',
  'markdown.css',
];

describe('Inkdrop CSS contract', () => {
  it('loads Inkdrop layers before every dependent stylesheet', () => {
    const importPositions = requiredImports.map((file) =>
      stylesheet.indexOf(`@inkdropapp/css/${file}`),
    );

    expect(importPositions.every((position) => position >= 0)).toBe(true);
    expect(importPositions).toEqual([...importPositions].sort((a, b) => a - b));
  });

  it('uses named main layouts rather than undocumented viewport thresholds', () => {
    const layout = { sidebarVisible: true, distractionFreeEnabled: false };
    expect(resolveShellLayout(842, defaultPreferences, layout)).toMatchObject({
      layout: 'main:full',
      sidebar: true,
      list: true,
    });
    expect(resolveShellLayout(841, defaultPreferences, layout)).toMatchObject({
      layout: 'main:slim',
      sidebar: false,
      list: true,
    });
    expect(resolveShellLayout(620, defaultPreferences, layout)).toMatchObject({
      compact: true,
      list: false,
    });
    expect(
      resolveShellLayout(
        1000,
        { ...defaultPreferences, sidebarWidth: 400, noteListWidth: 480 },
        layout,
      ),
    ).toMatchObject({ sidebar: false, list: true });
    expect(
      resolveShellLayout(1280, defaultPreferences, {
        ...layout,
        distractionFreeEnabled: true,
      }),
    ).toMatchObject({
      layout: 'main:distraction-free',
      sidebar: false,
      list: false,
    });
  });
});
