import { appErrorSchema } from './ipc';
import type { NoteStatus } from './note-metadata';
import { z } from './validation';

export const TRANSFER_CHANNELS = {
  backupStatus: 'backup:status',
  chooseBackupDirectory: 'backup:choose-directory',
  enableBackup: 'backup:enable',
  disableBackup: 'backup:disable',
  runBackup: 'backup:run',
  restoreBackup: 'backup:restore',
  exportNote: 'export:note',
  exportLibrary: 'export:library',
  importNotes: 'import:notes',
  exportNotes: 'export:notes',
  backupChanged: 'backup:changed',
} as const;

export const backupStatusSchema = z
  .object({
    directory: z.string().nullable(),
    lastCompletedAt: z.string().datetime().nullable(),
    state: z.enum(['idle', 'running', 'error']),
  })
  .strict();
export type BackupStatus = z.output<typeof backupStatusSchema>;

export const restoreSummarySchema = z
  .object({
    notebooks: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    copies: z.number().int().nonnegative(),
  })
  .strict();
export type RestoreSummary = z.output<typeof restoreSummarySchema>;

export const exportNoteSchema = z
  .object({
    id: z.uuid(),
    format: z.enum(['markdown', 'html', 'pdf', 'print']),
  })
  .strict();
export type ExportNoteInput = z.output<typeof exportNoteSchema>;

export const exportResultDataSchema = z
  .object({
    path: z.string().nullable(),
    notes: z.number().int().positive(),
    missingAttachments: z.number().int().nonnegative(),
  })
  .strict();
export type ExportSummary = z.output<typeof exportResultDataSchema>;

export const exportScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }).strict(),
  z.object({ kind: z.literal('notebook'), id: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal('notes'),
      ids: z.array(z.uuid()).min(1).max(10_000),
    })
    .strict(),
]);
export type ExportScope = z.output<typeof exportScopeSchema>;
export const exportNotesSchema = z
  .object({ format: z.enum(['markdown', 'html']), scope: exportScopeSchema })
  .strict();
export type ExportNotesInput = z.output<typeof exportNotesSchema>;

export const importNotesSchema = z
  .object({
    kind: z.enum(['files', 'folder']),
    notebookId: z.uuid().nullable(),
  })
  .strict();
export type ImportNotesInput = z.output<typeof importNotesSchema>;
export const importSummarySchema = z
  .object({
    notes: z.number().int().nonnegative(),
    notebooks: z.number().int().nonnegative(),
    images: z.number().int().nonnegative(),
    missingImages: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  })
  .strict();
export type ImportSummary = z.output<typeof importSummarySchema>;
export interface ImportedNote {
  id?: string;
  status?: NoteStatus;
  isPinned?: boolean;
  isTemplate?: boolean;
  title: string;
  body: string;
  folders: readonly string[];
  tags: readonly string[];
  createdAt?: string;
  updatedAt?: string;
}
export const importResultSchema = transferResult(
  importSummarySchema.nullable(),
);

export const backupDirectoryResultSchema = transferResult(
  z.string().nullable(),
);
export const backupStatusResultSchema = transferResult(backupStatusSchema);
export const restoreResultSchema = transferResult(
  restoreSummarySchema.nullable(),
);
export const exportResultSchema = transferResult(
  exportResultDataSchema.nullable(),
);

function transferResult<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }).strict(),
    z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
  ]);
}
