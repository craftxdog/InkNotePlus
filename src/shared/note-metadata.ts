import { z } from './validation';
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
    tags: z.array(z.string().trim().min(1).max(40)).max(32),
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
