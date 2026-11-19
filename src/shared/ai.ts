import { z } from './validation';
import { appErrorSchema } from './ipc';

export const AI_CHANNELS = {
  status: 'ai:status',
  setKey: 'ai:set-key',
  clearKey: 'ai:clear-key',
  run: 'ai:run',
  cancel: 'ai:cancel',
} as const;

export const aiProviderSchema = z.enum(['anthropic', 'openai', 'ollama']);
export type AiProvider = z.output<typeof aiProviderSchema>;
export const defaultAiModels: Readonly<Record<AiProvider, string>> = {
  anthropic: 'claude-opus-5-5',
  openai: '',
  ollama: '',
};

const maxAiText = 200_000;
export const aiRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      requestId: z.uuid(),
      kind: z.literal('transform'),
      instruction: z.string().trim().min(1).max(2000),
      text: z.string().max(maxAiText),
    })
    .strict(),
  z
    .object({
      requestId: z.uuid(),
      kind: z.literal('continue'),
      before: z.string().max(maxAiText),
      after: z.string().max(maxAiText),
    })
    .strict(),
]);
export type AiRequest = z.output<typeof aiRequestSchema>;

export const aiResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), text: z.string() }).strict(),
  z
    .object({
      status: z.enum([
        'disabled',
        'no_key',
        'bad_address',
        'auth',
        'rate_limit',
        'refused',
        'cancelled',
        'failed',
      ]),
    })
    .strict(),
]);
export type AiResponse = z.output<typeof aiResponseSchema>;
export type AiErrorStatus = Exclude<AiResponse['status'], 'ok'>;

export const aiStatusSchema = z
  .object({ hasKey: z.boolean(), persisted: z.boolean() })
  .strict();
export type AiStatus = z.output<typeof aiStatusSchema>;
export const aiKeySchema = z.string().trim().min(1).max(512);
export const aiCancelSchema = z.uuid();

const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }).strict(),
    z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
  ]);
export const aiStatusResultSchema = result(aiStatusSchema);
export const aiRunResultSchema = result(aiResponseSchema);
export const aiCancelResultSchema = result(z.boolean());
