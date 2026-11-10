import { appErrorSchema } from './ipc';
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
