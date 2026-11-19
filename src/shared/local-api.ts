import { z } from './validation';
import { appErrorSchema } from './ipc';

export const LOCAL_API_CHANNELS = {
  status: 'local-api:status',
  regenerate: 'local-api:regenerate',
  changed: 'local-api:changed',
} as const;

export const localApiStatusSchema = z
  .object({
    enabled: z.boolean(),
    running: z.boolean(),
    port: z.number().int().min(0).max(65_535),
    username: z.string().max(64),
    password: z.string().max(256).nullable(),
    persisted: z.boolean(),
    error: z.enum(['port_in_use', 'failed']).nullable(),
  })
  .strict();
export const localApiResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: localApiStatusSchema }).strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);
export type LocalApiStatus = z.output<typeof localApiStatusSchema>;
