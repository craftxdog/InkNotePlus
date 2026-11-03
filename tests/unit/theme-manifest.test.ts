import { describe, expect, it } from 'vitest';
import { themeManifestSchema } from '../../src/shared/theme-manifest';

const manifest = {
  name: 'example-light',
  version: '1.0.0',
  theme: true,
  themeAppearance: 'light',
  styleSheets: ['ui.css', 'syntax.css', 'preview.css'],
};
describe('unified theme manifest', () => {
  it('accepts one package with all three theme areas', () => {
    expect(themeManifestSchema.parse(manifest).theme).toBe(true);
  });
  it.each([
    { styleSheets: ['../secret.css'] },
    { styleSheets: ['https://example.com/theme.css'] },
    { styleSheets: ['ui.js'] },
    { styleSheets: ['ui.css', 'ui.css'] },
  ])(
    'rejects unsafe or duplicate style sheets $styleSheets',
    ({ styleSheets }) => {
      expect(
        themeManifestSchema.safeParse({ ...manifest, styleSheets }).success,
      ).toBe(false);
    },
  );
  it('rejects obsolete independent theme package types', () => {
    expect(
      themeManifestSchema.safeParse({ ...manifest, theme: 'syntax' }).success,
    ).toBe(false);
  });
});
