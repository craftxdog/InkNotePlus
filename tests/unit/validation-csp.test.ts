import { expect, it, vi } from 'vitest';

it('validates renderer schemas without probing dynamic code execution', async () => {
  vi.resetModules();
  const { z } = await import('zod');
  z.config({ jitless: false });
  const constructor = vi.spyOn(globalThis, 'Function');
  try {
    const { themeManifestSchema } =
      await import('../../src/shared/theme-manifest');
    const result = themeManifestSchema.safeParse({
      name: 'safe-theme',
      version: '1.0.0',
      theme: true,
      themeAppearance: 'light',
      styleSheets: ['ui.css'],
    });
    expect(result.success).toBe(true);
    expect(constructor).not.toHaveBeenCalled();
  } finally {
    constructor.mockRestore();
    z.config({ jitless: true });
  }
});
