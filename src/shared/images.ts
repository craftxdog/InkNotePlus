import { z } from './validation';
import { appErrorSchema } from './ipc';
export const managedImageUrlPattern =
  /^inknote-asset:\/\/images\/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/;
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
      .max(6_666_668)
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
