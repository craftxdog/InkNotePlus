import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { expect, it } from 'vitest';
import rendererConfig from '../../vite.renderer.config.mjs';

it('preserves native light-dark colors in the production renderer so theme changes can follow color-scheme', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'inknote-theme-build-'));
  try {
    await writeFile(
      path.join(root, 'index.html'),
      '<link rel="stylesheet" href="/theme.css">',
    );
    await writeFile(
      path.join(root, 'theme.css'),
      ':root { color-scheme: light dark; --page-background: light-dark(white, black); --text-color: light-dark(black, white); }',
    );
    const result = await build({
      ...rendererConfig,
      configFile: false,
      root,
      logLevel: 'silent',
      build: { ...rendererConfig.build, write: false, watch: null },
    });
    const bundles = Array.isArray(result) ? result : [result];
    const css = bundles
      .flatMap((bundle) => ('output' in bundle ? bundle.output : []))
      .filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map((item) => (item.type === 'asset' ? String(item.source) : ''))
      .join('\n');
    expect(css).toContain('light-dark(');
    expect(css).not.toContain('--lightningcss-light');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
