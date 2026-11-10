import { z } from './validation';
import { noteMetadataSchema, noteStatusSchema } from './note-metadata';

const maxTitleLength = 512;
export const maxBodyLength = 1_000_000;
const maxSearchQueryLength = 512;

const noteIdSchema = z.uuid();
const limitSchema = z.number().int().min(1).max(100);
const timestampSchema = z.string().datetime({ offset: true });

export const IPC_CHANNELS = {
  notes: {
    create: 'notes:create',
    update: 'notes:update',
    list: 'notes:list',
    search: 'notes:search',
    moveToTrash: 'notes:move-to-trash',
    restore: 'notes:restore',
  },
  events: {
    noteChanged: 'notes:changed',
  },
} as const;

export const createNoteInputSchema = z
  .object({
    title: z.string().max(maxTitleLength),
    body: z.string().max(maxBodyLength),
    metadata: noteMetadataSchema.optional(),
  })
  .strict();

export const listNotesInputSchema = z
  .object({
    id: noteIdSchema.optional(),
    titleContains: z.string().trim().min(1).max(120).optional(),
    limit: limitSchema.optional(),
    offset: z.number().int().min(0).max(1_000_000).optional(),
    scopeId: z.uuid().optional(),
    includeDescendants: z.boolean().optional(),
    sort: z.enum(['updated', 'title']).optional(),
    trashed: z.boolean().optional(),
    notebookId: z.uuid().nullable().optional(),
    status: noteStatusSchema.optional(),
    tag: z.string().trim().min(1).max(40).optional(),
    templates: z.boolean().optional(),
    excludeFinished: z.boolean().optional(),
  })
  .strict();

export const updateNoteInputSchema = z
  .object({
    id: noteIdSchema,
    title: z.string().max(maxTitleLength),
    body: z.string().max(maxBodyLength),
    expectedRevision: z.number().int().positive(),
    metadata: noteMetadataSchema.optional(),
    isPinned: z.boolean().optional(),
  })
  .strict();

export const searchNotesInputSchema = listNotesInputSchema
  .extend({
    query: z.string().trim().min(1).max(maxSearchQueryLength),
  })
  .strict();

export const noteIdInputSchema = z
  .object({
    id: noteIdSchema,
  })
  .strict();

export const noteSchema = z
  .object({
    id: noteIdSchema,
    title: z.string(),
    body: z.string(),
    isPinned: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletedAt: timestampSchema.nullable(),
    revision: z.number().int().positive(),
    metadata: noteMetadataSchema.optional(),
  })
  .strict();

export const noteListSchema = z.array(noteSchema);

export const noteChangedEventSchema = z
  .object({
    type: z.enum(['created', 'updated', 'trashed', 'restored']),
    note: noteSchema,
  })
  .strict();

export const appErrorSchema = z
  .object({
    code: z.enum(['invalid_input', 'not_found', 'conflict', 'unavailable']),
  })
  .strict();

export const noteResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: noteSchema }).strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);

export const noteListResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: noteListSchema }).strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);

export type CreateNoteInput = z.output<typeof createNoteInputSchema>;
export type UpdateNoteInput = z.output<typeof updateNoteInputSchema>;
export type ListNotesInput = z.output<typeof listNotesInputSchema>;
export type SearchNotesInput = z.output<typeof searchNotesInputSchema>;
export type NoteIdInput = z.output<typeof noteIdInputSchema>;
export type NoteProjection = z.output<typeof noteSchema>;
export type NoteChangedEvent = z.output<typeof noteChangedEventSchema>;
export type AppError = z.output<typeof appErrorSchema>;
export type AppErrorCode = AppError['code'];

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function success<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function failure<T = never>(code: AppErrorCode): Result<T> {
  return { ok: false, error: { code } };
}
