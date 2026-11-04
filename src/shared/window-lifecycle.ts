import { z } from './validation';
import { appErrorSchema } from './ipc';
export const WINDOW_CHANNELS = {
  readiness: 'window:save-readiness',
  prepare: 'window:prepare-close',
  confirm: 'window:confirm-close',
} as const;
export const closeRequestSchema = z.object({ requestId: z.uuid() }).strict();
export const closeConfirmationSchema = closeRequestSchema
  .extend({ saved: z.boolean() })
  .strict();
export const closeReadinessSchema = z.object({ ready: z.boolean() }).strict();
export const closeResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.boolean() }),
  z.object({ ok: z.literal(false), error: appErrorSchema }),
]);
