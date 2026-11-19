import { maxNoteTags, tagNameSchema } from '../../shared/tags';
import { z } from '../../shared/validation';

const webAddress = z
  .string()
  .max(4096)
  .refine((value) => /^https?:\/\//i.test(value) && URL.canParse(value));

export const clipPageSchema = z
  .object({
    url: webAddress,
    title: z.string().max(1000).default(''),
    html: z.string().max(1_900_000),
    tags: z.array(tagNameSchema).max(maxNoteTags).optional(),
    bookId: z.uuid().optional(),
  })
  .strict();
export type ClipPage = Pick<
  z.output<typeof clipPageSchema>,
  'url' | 'title' | 'html'
>;
