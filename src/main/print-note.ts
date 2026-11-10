import { BrowserWindow } from 'electron';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeAtomic } from './transfer-files';

export async function printNote(
  html: string,
  parent: BrowserWindow,
  pdfPath?: string,
): Promise<boolean> {
  const directory = await mkdtemp(path.join(tmpdir(), 'inknote-print-'));
  let window: BrowserWindow | undefined;
  try {
    const file = path.join(directory, 'note.html');
    await writeAtomic(file, html);
    window = new BrowserWindow({
      show: false,
      parent,
      title: 'Imprimir nota',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'inknote-print',
        javascript: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const contents = window.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
    await window.loadFile(file);
    if (pdfPath) {
      const pdf = await contents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      await writeAtomic(pdfPath, pdf);
      return true;
    }
    window.show();
    return await new Promise((resolve, reject) => {
      window!.once('closed', () => resolve(false));
      contents.print({ printBackground: true }, (success, reason) => {
        if (success) resolve(true);
        else if (/cancel(?:l)?ed/i.test(reason)) resolve(false);
        else reject(new Error(reason || 'Print failed.'));
      });
    });
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}
