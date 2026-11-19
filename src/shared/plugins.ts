import { z } from './validation';
import { appErrorSchema } from './ipc';

export const PLUGIN_CHANNELS = {
  list: 'plugins:list',
  install: 'plugins:install',
  remove: 'plugins:remove',
  load: 'plugins:load',
  openInit: 'plugins:open-init',
} as const;

export const pluginHostUrl = 'inknote-asset://plugin-host/index.html';
export const pluginNameSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
export const pluginInfoSchema = z
  .object({
    name: pluginNameSchema,
    version: z.string().max(64),
    description: z.string().max(500),
  })
  .strict();
export type PluginInfo = z.output<typeof pluginInfoSchema>;
export const pluginKeymapEntrySchema = z
  .object({
    selector: z.string().min(1).max(200),
    keystroke: z.string().min(1).max(80),
    command: z
      .string()
      .regex(/^[a-z0-9._-]+:[a-z0-9._-]+$/)
      .max(120),
  })
  .strict();
export type PluginKeymapEntry = z.output<typeof pluginKeymapEntrySchema>;
export const pluginBundleSchema = z
  .object({
    name: z.string().max(64),
    main: z.string().max(300),
    files: z.record(z.string().max(300), z.string()),
    keymap: z.array(pluginKeymapEntrySchema).max(200),
  })
  .strict();
export type PluginBundle = z.output<typeof pluginBundleSchema>;
export const pluginInstallResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), name: z.string() }).strict(),
  z.object({ ok: z.literal(false), message: z.string().max(300) }).strict(),
]);
export type PluginInstallResponse = z.output<
  typeof pluginInstallResponseSchema
>;

const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }).strict(),
    z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
  ]);
export const pluginListResultSchema = result(z.array(pluginInfoSchema));
export const pluginInstallResultSchema = result(
  pluginInstallResponseSchema.nullable(),
);
export const pluginLoadResultSchema = result(pluginBundleSchema.nullable());
export const pluginDoneResultSchema = result(z.boolean());
