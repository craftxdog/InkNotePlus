import { z } from './validation';

export const themeManifestSchema = z
  .object({
    name: z
      .string()
      .max(100)
      .regex(/^[a-z][a-z0-9-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/),
    theme: z.literal(true),
    themeAppearance: z.enum(['light', 'dark']),
    styleSheets: z
      .array(z.string().regex(/^[a-zA-Z0-9_-]+\.css$/))
      .min(1)
      .max(16),
  })
  .refine(
    (manifest) =>
      new Set(manifest.styleSheets).size === manifest.styleSheets.length,
    {
      message: 'Theme stylesheets must not contain duplicates.',
    },
  );
export type ThemeManifest = z.output<typeof themeManifestSchema>;
