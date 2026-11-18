import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TRANSFER_CHANNELS } from '../../src/shared/transfer';

const showOpenDialog = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ dialog: { showOpenDialog } }));
const { registerTransferHandlers } =
  await import('../../src/main/ipc/transfer-handlers');

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'inknote-import-ipc-'));
  showOpenDialog.mockReset();
});
afterEach(() => rm(directory, { recursive: true, force: true }));

function setup() {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, input: unknown) => unknown
  >();
  const frame = {};
  const webContents = { mainFrame: frame };
  const window = { webContents } as unknown as BrowserWindow;
  const importNotes = vi.fn(() => ({ notes: 1, notebooks: 0 }));
  const onImported = vi.fn();
  registerTransferHandlers({
    ipc: {
      handle: (channel: string, handler: never) =>
        handlers.set(channel, handler),
      removeHandler: () => {},
    } as unknown as Pick<IpcMain, 'handle' | 'removeHandler'>,
    getWindow: () => window,
    backup: {} as never,
    library: { importNotes } as never,
    userData: directory,
    getPreferences: () => ({}) as never,
    isDecodableImage: () => true,
    onImported,
  });
  const invoke = (input: unknown, sender: unknown = webContents) =>
    handlers.get(TRANSFER_CHANNELS.importNotes)!(
      { sender, senderFrame: frame } as IpcMainInvokeEvent,
      input,
    );
  return { invoke, importNotes, onImported };
}
const input = { kind: 'files', notebookId: null };

it('imports the chosen files and schedules a backup', async () => {
  const file = path.join(directory, 'nota.md');
  await writeFile(file, '# Título\n\ntexto');
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] });
  const { invoke, importNotes, onImported } = setup();
  await expect(invoke(input)).resolves.toEqual({
    ok: true,
    data: { notes: 1, notebooks: 0, images: 0, missingImages: 0, skipped: 0 },
  });
  expect(importNotes).toHaveBeenCalledWith(
    [expect.objectContaining({ title: 'Título', body: 'texto' })],
    null,
  );
  expect(onImported).toHaveBeenCalledTimes(1);
});

it('does nothing when the dialog is cancelled', async () => {
  showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  const { invoke, importNotes } = setup();
  await expect(invoke(input)).resolves.toEqual({ ok: true, data: null });
  expect(importNotes).not.toHaveBeenCalled();
});

it('opens a folder picker for folders', async () => {
  showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  await setup().invoke({ kind: 'folder', notebookId: null });
  expect(showOpenDialog.mock.calls[0][1].properties).toContain('openDirectory');
});

it('rejects untrusted senders and invalid requests before any dialog', async () => {
  const { invoke } = setup();
  await expect(invoke(input, {})).resolves.toMatchObject({ ok: false });
  await expect(
    invoke({ kind: 'url', notebookId: null }),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'invalid_input' },
  });
  expect(showOpenDialog).not.toHaveBeenCalled();
});
