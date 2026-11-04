import { z } from './validation';
import { themeManifestSchema } from './theme-manifest';

export const themeNameSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*$/);
export const themePackageSchema = z.object({
  manifest: themeManifestSchema,
  label: z.string().max(200),
  styles: z.array(z.string().startsWith('inknote-asset://themes/')).max(16),
  source: z.literal('installed'),
});
export type InstalledTheme = z.output<typeof themePackageSchema>;
export const registryThemeSchema = z.object({
  name: themeNameSchema,
  version: z.string().max(100),
  description: z.string().max(2000),
  downloads: z.number().nonnegative(),
  compatible: z.boolean(),
});
export type RegistryTheme = z.output<typeof registryThemeSchema>;
export const themeErrorSchema = z.object({
  code: z.enum(['unavailable', 'invalid_package', 'incompatible', 'cancelled']),
});
export type ThemeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: z.output<typeof themeErrorSchema> };
export function themeResultSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: themeErrorSchema }),
  ]);
}
export const themeListResultSchema = themeResultSchema(
  z.array(themePackageSchema),
);
export const registryResultSchema = themeResultSchema(
  z.array(registryThemeSchema),
);
export const themeInstallResultSchema = themeResultSchema(themePackageSchema);
export const customStylesSchema = z.string().max(100_000);
export const stylesResultSchema = themeResultSchema(customStylesSchema);
export const themeNameInputSchema = z
  .object({ name: themeNameSchema })
  .strict();
export const registryInputSchema = z
  .object({
    query: z.string().trim().max(100).default(''),
    page: z.number().int().min(0).max(100).default(0),
    sort: z.enum(['majority', 'recency', 'newness']).default('majority'),
  })
  .strict();
export type ThemeRegistryInput = z.input<typeof registryInputSchema>;
export const THEME_CHANNELS = {
  list: 'themes:list',
  browse: 'themes:browse',
  install: 'themes:install',
  import: 'themes:import',
  remove: 'themes:remove',
  stylesGet: 'themes:styles-get',
  stylesSet: 'themes:styles-set',
  stylesChanged: 'themes:styles-changed',
} as const;
