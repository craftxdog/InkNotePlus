import { z } from './validation';
import { appErrorSchema } from './ipc';

export const themeIdSchema = z.enum(['inknote-light', 'inknote-dark']);
export const editorModeSchema = z.enum(['edit', 'split', 'preview']);
export const preferencesSchema = z
  .object({
    theme: themeIdSchema,
    sidebarWidth: z.number().int().min(160).max(400),
    noteListWidth: z.number().int().min(220).max(480),
    editorMode: editorModeSchema,
    splitRatio: z.number().int().min(20).max(80).default(50),
  })
  .strict();
export const preferencesPatchSchema = preferencesSchema
  .partial()
  .extend({ splitRatio: z.number().int().min(20).max(80).optional() })
  .strict();
export const bootstrapSchema = z
  .object({
    preferences: preferencesSchema,
    styleNonce: z.string().regex(/^[a-zA-Z0-9+/=]{24,128}$/),
    platform: z.enum(['darwin', 'win32', 'linux']),
  })
  .strict();
export type ThemeId = z.output<typeof themeIdSchema>;
export type EditorMode = z.output<typeof editorModeSchema>;
export type Preferences = z.output<typeof preferencesSchema>;
export type PreferencesPatch = z.output<typeof preferencesPatchSchema>;
export type AppBootstrap = z.output<typeof bootstrapSchema>;
export const defaultPreferences: Preferences = {
  theme: 'inknote-light',
  sidebarWidth: 220,
  noteListWidth: 300,
  editorMode: 'split',
  splitRatio: 50,
};
export const PREFERENCES_CHANNELS = {
  get: 'preferences:get',
  update: 'preferences:update',
} as const;
export const emptyPreferencesInputSchema = z.object({}).strict();
export const bootstrapResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: bootstrapSchema }).strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);
export const preferencesResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: preferencesSchema }).strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);
