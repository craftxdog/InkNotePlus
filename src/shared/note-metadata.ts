import { z } from './validation';
import { tagNameSchema } from './tags';
export const noteStatusSchema = z.enum([
  'none',
  'active',
  'onhold',
  'completed',
  'dropped',
]);
export const noteMetadataSchema = z
  .object({
    notebookId: z.uuid().nullable(),
    status: noteStatusSchema,
    tags: z.array(tagNameSchema).max(32),
    isTemplate: z.boolean(),
  })
  .strict();
export const defaultNoteMetadata: NoteMetadata = {
  notebookId: null,
  status: 'none',
  tags: [],
  isTemplate: false,
};
export type NoteStatus = z.output<typeof noteStatusSchema>;
export type NoteMetadata = z.output<typeof noteMetadataSchema>;
