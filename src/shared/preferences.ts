import { z } from './validation';
import { appErrorSchema } from './ipc';
import { keybindingsSchema } from './keybindings';

export const themeIdSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*$/);
export const editorModeSchema = z.enum(['edit', 'split', 'preview']);
export const lineWrappingSchema = z.preprocess(
  (value) => (value === true ? 'all' : value === false ? 'off' : value),
  z.enum(['off', 'all', 'prose', 'cursor']),
);
export type LineWrapping = z.output<typeof lineWrappingSchema>;
const fontFamilySchema = z
  .string()
  .max(240)
  .regex(/^[\p{L}\p{N}\s_,'"\u002e-]*$/u);
const fields = {
  developmentMode: z.boolean(),
  theme: themeIdSchema,
  sidebarWidth: z.number().int().min(160).max(400),
  noteListWidth: z.number().int().min(220).max(480),
  editorMode: editorModeSchema,
  splitRatio: z.number().int().min(20).max(80),
  defaultNotebookId: z.uuid().nullable(),
  notebookScopeId: z.uuid().nullable(),
  expandedNotebookIds: z.array(z.uuid()).max(1000),
  showNoteCounts: z.boolean(),
  noteSort: z.enum(['updated', 'title']),
  editorFontFamily: fontFamilySchema,
  editorFontSize: z.number().int().min(10).max(40),
  editorLineHeight: z.number().min(1).max(3),
  lineNumbers: z.boolean(),
  lineWrapping: lineWrappingSchema,
  activeLine: z.boolean(),
  spellcheck: z.boolean(),
  showToolbar: z.boolean(),
  previewFontFamily: fontFamilySchema,
  previewFontSize: z.number().int().min(10).max(40),
  previewLineHeight: z.number().min(1).max(3),
  syncScroll: z.boolean(),
  mathEnabled: z.boolean(),
  mermaidEnabled: z.boolean(),
  mermaidPanZoom: z.boolean(),
  mermaidToolbar: z.boolean(),
  keybindings: keybindingsSchema,
};
const recordSchema = z.object(fields).strict();
export type Preferences = z.output<typeof recordSchema>;
export const defaultPreferences: Preferences = {
  developmentMode: false,
  theme: 'inknote-light',
  sidebarWidth: 220,
  noteListWidth: 300,
  editorMode: 'split',
  splitRatio: 50,
  defaultNotebookId: null,
  notebookScopeId: null,
  expandedNotebookIds: [],
  showNoteCounts: true,
  noteSort: 'updated',
  // Empty families inherit the theme/platform stack instead of downloading fonts.
  editorFontFamily: '',
  editorFontSize: 14,
  editorLineHeight: 1.6,
  lineNumbers: true,
  lineWrapping: 'cursor',
  activeLine: true,
  spellcheck: true,
  showToolbar: true,
  previewFontFamily: '',
  previewFontSize: 16,
  previewLineHeight: 1.5,
  syncScroll: true,
  mathEnabled: true,
  mermaidEnabled: true,
  mermaidPanZoom: true,
  mermaidToolbar: true,
  keybindings: [],
};
// Fill newly introduced settings on existing installations, preserving every
// stored value. Patches use raw fields so defaults never reset another setting.
export const preferencesSchema = z.preprocess(
  (value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? { ...defaultPreferences, ...value }
      : value,
  recordSchema,
);
export const preferencesPatchSchema = recordSchema.partial().strict();
export const bootstrapSchema = z
  .object({
    preferences: preferencesSchema,
    styleNonce: z.string().regex(/^[a-zA-Z0-9+/=]{24,128}$/),
    platform: z.enum(['darwin', 'win32', 'linux']),
  })
  .strict();
export type ThemeId = z.output<typeof themeIdSchema>;
export type EditorMode = z.output<typeof editorModeSchema>;
export type PreferencesPatch = z.output<typeof preferencesPatchSchema>;
export type AppBootstrap = z.output<typeof bootstrapSchema>;
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
