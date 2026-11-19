import { z } from './validation';
import { appErrorSchema } from './ipc';
export const WINDOW_CHANNELS = {
  readiness: 'window:save-readiness',
  prepare: 'window:prepare-close',
  confirm: 'window:confirm-close',
  background: 'window:set-background',
  reload: 'window:reload',
} as const;
export const MENU_COMMAND_CHANNEL = 'menu:command';
export const NOTE_WINDOW_CHANNEL = 'window:open-note';
export const noteWindowResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);
export const windowBackgroundSchema = z.string().regex(/^#[a-f0-9]{6}$/i);
export const closeRequestSchema = z.object({ requestId: z.uuid() }).strict();
export const closeConfirmationSchema = closeRequestSchema
  .extend({ saved: z.boolean() })
  .strict();
export const closeReadinessSchema = z.object({ ready: z.boolean() }).strict();
export const closeResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.boolean() }),
  z.object({ ok: z.literal(false), error: appErrorSchema }),
]);
