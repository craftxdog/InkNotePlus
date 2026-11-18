import { z } from './validation';
import { appErrorSchema } from './ipc';
// Inkdrop's attachment limit: 10 MiB per file.
// https://developers.inkdrop.app/data-access/files
export const maxImageBytes = 10_485_760;
export const importableImageType =
  /^image\/(?:png|jpeg|gif|webp|svg\+xml|heic|heif)$/;
export const managedImageUrlPattern =
  /^inknote-asset:\/\/images\/[a-f0-9]{64}\.(?:png|jpg|gif|webp|svg)$/;
export const imageSchema = z
  .object({
    url: z.string().regex(managedImageUrlPattern),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type ManagedImage = z.output<typeof imageSchema>;
export const imageWriteSchema = z
  .object({
    base64: z
      .string()
      .min(1)
      .max(Math.ceil(maxImageBytes / 3) * 4)
      .regex(/^[a-zA-Z0-9+/]+={0,2}$/),
  })
  .strict();
export const imageResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: imageSchema.nullable() }),
  z.object({ ok: z.literal(false), error: appErrorSchema }),
]);
export const IMAGE_CHANNELS = {
  import: 'images:import',
  write: 'images:write',
} as const;
