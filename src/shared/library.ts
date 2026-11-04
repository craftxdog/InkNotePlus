import { z } from './validation';
import { appErrorSchema, listNotesInputSchema } from './ipc';

import { noteStatusSchema } from './note-metadata';
import { notebookIconSchema } from './notebook-icons';
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
    descendantCount: z.number().int().nonnegative().default(0),
    icon: notebookIconSchema.default('book-open'),
  })
  .strict();
export const createNotebookSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    parentId: z.uuid().nullable().default(null),
    icon: notebookIconSchema.optional(),
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
    unfiled: z.number().int().nonnegative().default(0),
    matching: z.number().int().nonnegative().default(0),
  })
  .strict();
export type LibrarySnapshot = z.output<typeof librarySchema>;
export type Notebook = z.output<typeof notebookSchema>;
export type CreateNotebookInput = z.input<typeof createNotebookSchema>;
export const libraryInputSchema = z
  .object({
    scopeId: z.uuid().nullable().optional(),
    filter: listNotesInputSchema.optional(),
    query: z.string().max(512).optional(),
  })
  .strict();
export type LibraryInput = z.output<typeof libraryInputSchema>;
export const LIBRARY_CHANNELS = {
  get: 'library:get',
  createNotebook: 'library:create-notebook',
  setNotebookIcon: 'library:set-notebook-icon',
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
  unfiled: 0,
  matching: 0,
};
