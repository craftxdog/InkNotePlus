import { z } from './validation';
import { appErrorSchema } from './ipc';

import { noteStatusSchema } from './note-metadata';
export {
  noteStatusSchema,
  noteMetadataSchema,
  defaultNoteMetadata,
  type NoteStatus,
  type NoteMetadata,
} from './note-metadata';
export const notebookSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(80),
    parentId: z.uuid().nullable(),
    count: z.number().int().nonnegative(),
  })
  .strict();
export const createNotebookSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    parentId: z.uuid().nullable().default(null),
  })
  .strict();
export const librarySchema = z
  .object({
    notebooks: z.array(notebookSchema),
    tags: z.array(
      z.object({ name: z.string(), count: z.number().int().nonnegative() }),
    ),
    statuses: z.record(noteStatusSchema, z.number().int().nonnegative()),
    total: z.number().int().nonnegative(),
    trash: z.number().int().nonnegative(),
    templates: z.number().int().nonnegative(),
  })
  .strict();
export type LibrarySnapshot = z.output<typeof librarySchema>;
export type Notebook = z.output<typeof notebookSchema>;
export type CreateNotebookInput = z.input<typeof createNotebookSchema>;
export const LIBRARY_CHANNELS = {
  get: 'library:get',
  createNotebook: 'library:create-notebook',
} as const;
export const libraryResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: librarySchema }),
  z.object({ ok: z.literal(false), error: appErrorSchema }),
]);
export const notebookResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: notebookSchema }),
  z.object({ ok: z.literal(false), error: appErrorSchema }),
]);
export const emptyLibrary: LibrarySnapshot = {
  notebooks: [],
  tags: [],
  statuses: { active: 0, onhold: 0, completed: 0, dropped: 0 },
  total: 0,
  trash: 0,
  templates: 0,
};
