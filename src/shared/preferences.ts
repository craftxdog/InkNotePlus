import { pluginNameSchema } from './plugins';
import { aiProviderSchema, defaultAiModels } from './ai';
import { z } from './validation';
import { appErrorSchema, noteSortSchema } from './ipc';
import { keybindingsSchema, keystrokeSchema } from './keybindings';
import { tagNameSchema } from './tags';

export const themeIdSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*$/);
// Chrome extension ids use the letters a to p, and Firefox uses a UUID.
export const extensionOriginSchema = z
  .string()
  .regex(
    /^(?:chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
  );
// What apps and AI agents can reach through the local API and MCP.
export const localApiScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }).strict(),
  z.object({ type: z.literal('notebook'), notebookId: z.uuid() }).strict(),
  z.object({ type: z.literal('tag'), tag: tagNameSchema }).strict(),
]);
export type LocalApiScope = z.output<typeof localApiScopeSchema>;
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
  checkForUpdates: z.boolean(),
  globalToggleShortcut: keystrokeSchema,
  globalQuickNoteShortcut: keystrokeSchema,
  trayEnabled: z.boolean(),
  aiEnabled: z.boolean(),
  aiProvider: aiProviderSchema,
  aiModel: z.string().max(200),
  aiBaseUrl: z.string().max(2048),
  aiSuggestMode: z.enum(['manual', 'auto']),
  syncProxy: z.string().max(300),
  remoteImages: z.enum(['blocked', 'allowed']),
  remoteImageNotes: z.array(z.uuid()).max(1000),
  enabledPlugins: z.array(pluginNameSchema).max(100),
  initScriptEnabled: z.boolean(),
  localApiEnabled: z.boolean(),
  localApiPort: z.number().int().min(1024).max(65_535),
  localApiExtensionOrigins: z.array(extensionOriginSchema).max(10),
  localApiScope: localApiScopeSchema,
  theme: themeIdSchema,
  followSystemTheme: z.boolean(),
  lightTheme: themeIdSchema,
  darkTheme: themeIdSchema,
  sidebarWidth: z.number().int().min(160).max(400),
  noteListWidth: z.number().int().min(220).max(480),
  editorMode: editorModeSchema,
  splitRatio: z.number().int().min(20).max(80),
  defaultNotebookId: z.uuid().nullable(),
  notebookScopeId: z.uuid().nullable(),
  expandedNotebookIds: z.array(z.uuid()).max(1000),
  showNoteCounts: z.boolean(),
  noteSort: noteSortSchema,
  editorFontFamily: fontFamilySchema,
  editorFontSize: z.number().int().min(10).max(40),
  editorLineHeight: z.number().min(1).max(3),
  lineNumbers: z.boolean(),
  lineWrapping: lineWrappingSchema,
  readableLineLength: z.boolean(),
  keyboardMode: z.enum(['standard', 'vim']),
  activeLine: z.boolean(),
  spellcheck: z.boolean(),
  linkTitleFetch: z.boolean(),
  showToolbar: z.boolean(),
  toolbarPlacement: z.enum(['fixed', 'floating']),
  previewFontFamily: fontFamilySchema,
  previewFontSize: z.number().int().min(10).max(40),
  previewLineHeight: z.number().min(1).max(3),
  syncScroll: z.boolean(),
  mathEnabled: z.boolean(),
  mermaidEnabled: z.boolean(),
  mermaidPanZoom: z.boolean(),
  mermaidToolbar: z.boolean(),
  codeLineNumbers: z.boolean(),
  keybindings: keybindingsSchema,
};
const recordSchema = z.object(fields).strict();
export type Preferences = z.output<typeof recordSchema>;
export const defaultPreferences: Preferences = {
  developmentMode: false,
  checkForUpdates: true,
  globalToggleShortcut: '',
  globalQuickNoteShortcut: '',
  trayEnabled: false,
  aiEnabled: false,
  aiProvider: 'anthropic',
  aiModel: defaultAiModels.anthropic,
  aiBaseUrl: '',
  aiSuggestMode: 'manual',
  syncProxy: '',
  remoteImages: 'blocked',
  remoteImageNotes: [],
  enabledPlugins: [],
  initScriptEnabled: false,
  localApiEnabled: false,
  localApiPort: 19840,
  localApiExtensionOrigins: [],
  localApiScope: { type: 'all' },
  theme: 'inknote-light',
  followSystemTheme: false,
  lightTheme: 'inknote-light',
  darkTheme: 'inknote-dark',
  sidebarWidth: 220,
  noteListWidth: 300,
  editorMode: 'split',
  splitRatio: 50,
  defaultNotebookId: null,
  notebookScopeId: null,
  expandedNotebookIds: [],
  showNoteCounts: true,
  noteSort: 'updated-desc',
  // Empty families inherit the theme/platform stack instead of downloading fonts.
  editorFontFamily: '',
  editorFontSize: 14,
  editorLineHeight: 1.6,
  lineNumbers: true,
  lineWrapping: 'cursor',
  readableLineLength: false,
  keyboardMode: 'standard',
  activeLine: true,
  spellcheck: true,
  linkTitleFetch: false,
  showToolbar: true,
  toolbarPlacement: 'floating',
  previewFontFamily: '',
  previewFontSize: 16,
  previewLineHeight: 1.5,
  syncScroll: true,
  mathEnabled: true,
  mermaidEnabled: true,
  mermaidPanZoom: true,
  mermaidToolbar: true,
  codeLineNumbers: false,
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

export function pruneNotebookPreferences(
  preferences: Preferences,
  missing: (id: string) => boolean,
): PreferencesPatch {
  const patch: PreferencesPatch = {};
  if (preferences.defaultNotebookId && missing(preferences.defaultNotebookId))
    patch.defaultNotebookId = null;
  if (preferences.notebookScopeId && missing(preferences.notebookScopeId))
    patch.notebookScopeId = null;
  const expanded = preferences.expandedNotebookIds.filter((id) => !missing(id));
  if (expanded.length !== preferences.expandedNotebookIds.length)
    patch.expandedNotebookIds = expanded;
  return patch;
}
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
