import { z } from './validation';

export const tagNameSchema = z.string().trim().min(1).max(40);
export const tagColorSchema = z.enum([
  'default',
  'red',
  'orange',
  'yellow',
  'olive',
  'green',
  'teal',
  'blue',
  'violet',
  'purple',
  'pink',
  'brown',
  'grey',
  'black',
]);
export type TagColor = z.output<typeof tagColorSchema>;

export const tagRecordSchema = z
  .object({
    name: tagNameSchema,
    color: tagColorSchema.nullable(),
  })
  .strict();
export type TagRecord = z.output<typeof tagRecordSchema>;

export const updateTagSchema = z
  .object({
    name: tagNameSchema,
    nextName: tagNameSchema,
    color: tagColorSchema,
  })
  .strict();
export type UpdateTagInput = z.output<typeof updateTagSchema>;

export const deleteTagSchema = z.object({ name: tagNameSchema }).strict();
