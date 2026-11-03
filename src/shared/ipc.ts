import { z } from 'zod';

const maxTitleLength = 512;
const maxBodyLength = 1_000_000;
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
    title: z.string().trim().max(maxTitleLength),
    body: z.string().max(maxBodyLength),
  })
  .strict();

export const listNotesInputSchema = z
  .object({
    limit: limitSchema.optional(),
  })
  .strict();

export const updateNoteInputSchema = z
  .object({
    id: noteIdSchema,
    title: z.string().trim().max(maxTitleLength),
    body: z.string().max(maxBodyLength),
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const searchNotesInputSchema = z
  .object({
    query: z.string().trim().min(1).max(maxSearchQueryLength),
    limit: limitSchema.optional(),
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
