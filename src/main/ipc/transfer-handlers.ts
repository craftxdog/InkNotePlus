import { dialog, type BrowserWindow, type IpcMain } from 'electron';
import path from 'node:path';
import type { SqliteLibraryTransfer } from '../../infrastructure/sqlite/sqlite-library-transfer';
import { failure, success, type Result } from '../../shared/ipc';
import type { Preferences } from '../../shared/preferences';
import { TRANSFER_CHANNELS, exportNoteSchema } from '../../shared/transfer';
import { z } from '../../shared/validation';
import type { BackupService } from '../backup-service';
import {
  exportLibraryMarkdown,
  exportMarkdown,
  exportName,
} from '../markdown-export';
import { writeAtomic } from '../transfer-files';
import { isTrustedIpcEvent } from './note-handlers';

const empty = z.object({}).strict();
const extensions = { markdown: 'md', html: 'html', pdf: 'pdf' } as const;

export function registerTransferHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  getWindow: () => BrowserWindow | null;
  backup: BackupService;
  library: SqliteLibraryTransfer;
  userData: string;
  getPreferences: () => Preferences;
}) {
  const { ipc, backup, library } = options;
  const channels: string[] = [];
  const images = path.join(options.userData, 'images');
  let pending: { window: BrowserWindow; directory: string } | undefined;
  let exporting = false;

  function handle<T, R>(
    channel: string,
    schema: z.ZodType<T>,
    action: (window: BrowserWindow, input: T) => Result<R> | Promise<Result<R>>,
  ) {
    ipc.handle(channel, async (event, input: unknown) => {
      const window = options.getWindow();
      if (!window || !isTrustedIpcEvent(event, window.webContents))
        return failure('unavailable');
      const parsed = schema.safeParse(input);
      if (!parsed.success) return failure('invalid_input');
      try {
        return await action(window, parsed.data);
      } catch (error) {
        // Avoid leaking paths and library content across IPC.
        console.warn(
          `InkNote transfer failed (${channel})`,
          error instanceof Error ? error.name : '',
        );
        return failure('unavailable');
      }
    });
    channels.push(channel);
  }

  async function exportOnce<R>(
    action: () => Promise<Result<R>>,
  ): Promise<Result<R>> {
    if (exporting) return failure('conflict');
    exporting = true;
    try {
      return await action();
    } finally {
      exporting = false;
    }
  }

  handle(TRANSFER_CHANNELS.backupStatus, empty, () => success(backup.status));
  handle(TRANSFER_CHANNELS.chooseBackupDirectory, empty, async (window) => {
    const directory = await chooseDirectory(
      window,
      'Elegir carpeta para respaldos',
      backup.status.directory,
    );
    if (directory) pending = { window, directory };
    return success(directory);
  });
  handle(TRANSFER_CHANNELS.enableBackup, empty, async (window) => {
    const selection = pending;
    if (selection?.window !== window) return failure('invalid_input');
    const status = await backup.enable(selection.directory);
    if (pending === selection && status.state !== 'error') pending = undefined;
    return success(status);
  });
  handle(TRANSFER_CHANNELS.disableBackup, empty, async () => {
    pending = undefined;
    return success(await backup.disable());
  });
  handle(TRANSFER_CHANNELS.runBackup, empty, async () =>
    success(await backup.runNow()),
  );
  handle(TRANSFER_CHANNELS.restoreBackup, empty, async (window) => {
    const directory = await chooseDirectory(
      window,
      'Seleccionar respaldo de InkNote',
      backup.status.directory,
    );
    if (!directory) return success(null);
    return success(
      await backup.restore(directory, async (notes) => {
        if (window.isDestroyed()) return false;
        const result = await dialog.showMessageBox(window, {
          type: 'question',
          title: 'Restaurar respaldo',
          message: `¿Restaurar el respaldo con ${notes} notas?`,
          detail:
            'Se conservarán tus notas actuales. Las versiones diferentes del respaldo se añadirán como copias recuperadas.',
          buttons: ['Cancelar', 'Restaurar'],
          defaultId: 0,
          cancelId: 0,
        });
        return result.response === 1;
      }),
    );
  });
  handle(
    TRANSFER_CHANNELS.exportNote,
    exportNoteSchema,
    (window, { id, format }) =>
      exportOnce(async () => {
        const note = library.readNote(id);
        if (!note) return failure('not_found');
        const extension = format === 'print' ? undefined : extensions[format];
        let file: string | undefined;
        if (extension) {
          const selection = await dialog.showSaveDialog(window, {
            title: `Exportar nota como ${format === 'markdown' ? 'Markdown' : extension.toUpperCase()}`,
            defaultPath: `${exportName(note.title)}.${extension}`,
            filters: [
              {
                name:
                  format === 'markdown' ? 'Markdown' : extension.toUpperCase(),
                extensions: [extension],
              },
            ],
          });
          if (selection.canceled || !selection.filePath) return success(null);
          file = selection.filePath;
        }
        let missingAttachments: number;
        if (format === 'markdown' && file) {
          missingAttachments = await exportMarkdown(note, file, images);
        } else {
          const { renderNoteExport } = await import('../render-note-export');
          const rendered = await renderNoteExport(
            note,
            options.getPreferences(),
            images,
          );
          missingAttachments = rendered.missingAttachments;
          const { html } = rendered;
          if (format === 'html' && file) await writeAtomic(file, html);
          else {
            if (window.isDestroyed()) return success(null);
            const { printNote } = await import('../print-note');
            if (!(await printNote(html, window, file))) return success(null);
          }
        }
        return success({ path: file ?? null, notes: 1, missingAttachments });
      }),
  );
  handle(TRANSFER_CHANNELS.exportLibrary, empty, (window) =>
    exportOnce(async () => {
      const directory = await chooseDirectory(
        window,
        'Exportar biblioteca como Markdown',
      );
      return success(
        directory
          ? await exportLibraryMarkdown(library, directory, images)
          : null,
      );
    }),
  );
  return {
    dispose: () => channels.forEach((channel) => ipc.removeHandler(channel)),
  };
}

async function chooseDirectory(
  window: BrowserWindow,
  title: string,
  initial?: string | null,
): Promise<string | null> {
  const result = await dialog.showOpenDialog(window, {
    title,
    defaultPath: initial ?? undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}
