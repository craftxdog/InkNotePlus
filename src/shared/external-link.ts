import { z } from './validation';
import { appErrorSchema } from './ipc';

export const EXTERNAL_LINK_CHANNEL = 'links:open-external';
export const externalLinkSchema = z
  .object({
    url: z
      .string()
      .max(4096)
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      }),
  })
  .strict();
export const externalLinkResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);
