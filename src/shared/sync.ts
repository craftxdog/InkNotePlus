import { z } from './validation';
import { appErrorSchema } from './ipc';

export const SYNC_CHANNELS = {
  status: 'sync:status',
  connect: 'sync:connect',
  disconnect: 'sync:disconnect',
  run: 'sync:run',
  diagnose: 'sync:diagnose',
  changed: 'sync:changed',
} as const;

export const syncErrorCodeSchema = z.enum([
  'bad_address',
  'unreachable',
  'unauthorized',
  'forbidden',
  'server',
  'wrong_passphrase',
  'mass_delete',
  'failed',
]);
export type SyncErrorStatus = z.output<typeof syncErrorCodeSchema>;

export const syncConnectionSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    username: z.string().trim().min(1).max(256),
    database: z
      .string()
      .trim()
      .max(128)
      .regex(/^[a-z][a-z0-9_$()+/-]*$/),
  })
  .strict();
export type SyncConnection = z.output<typeof syncConnectionSchema>;
export const syncConnectSchema = syncConnectionSchema
  .extend({
    password: z.string().min(1).max(1024),
    passphrase: z.string().min(8).max(1024),
  })
  .strict();
export type SyncConnectInput = z.output<typeof syncConnectSchema>;
export const syncDiagnoseSchema = syncConnectionSchema
  .extend({ password: z.string().max(1024) })
  .strict();

const syncResultSchema = z
  .object({
    pushed: z.number().int().min(0),
    pulled: z.number().int().min(0),
    conflicts: z.number().int().min(0),
    unreadable: z.number().int().min(0),
    skippedFiles: z.number().int().min(0),
  })
  .strict();
export const syncStatusSchema = z
  .object({
    configured: z.boolean(),
    persisted: z.boolean(),
    connection: syncConnectionSchema.nullable(),
    state: z.enum(['off', 'idle', 'syncing', 'error']),
    error: syncErrorCodeSchema.nullable(),
    lastSyncAt: z.string().nullable(),
    lastResult: syncResultSchema.nullable(),
  })
  .strict();
export type SyncStatus = z.output<typeof syncStatusSchema>;

export const syncDiagnosticSchema = z
  .object({
    step: z.enum(['address', 'proxy', 'server', 'login']),
    ok: z.boolean(),
    detail: z.string().max(300),
  })
  .strict();
export type SyncDiagnostic = z.output<typeof syncDiagnosticSchema>;

const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }).strict(),
    z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
  ]);
export const syncStatusResultSchema = result(syncStatusSchema);
export const syncConnectResultSchema = result(
  z.object({ error: syncErrorCodeSchema.nullable() }).strict(),
);
export const syncDiagnoseResultSchema = result(z.array(syncDiagnosticSchema));
