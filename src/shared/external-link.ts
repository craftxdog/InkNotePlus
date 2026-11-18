import { z } from './validation';
import { appErrorSchema } from './ipc';

export const EXTERNAL_LINK_CHANNEL = 'links:open-external';
export const LINK_TITLE_CHANNEL = 'links:fetch-title';
export const maxLinkTitleLength = 200;
export const externalLinkSchema = z
  .object({
    url: z
      .string()
      .max(4096)
      .url()
      .refine((value) => {
        // Refinements also run after the URL check above has failed.
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      }),
  })
  .strict();
export const linkTitleResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      data: z.string().max(maxLinkTitleLength).nullable(),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);
export const externalLinkResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);
