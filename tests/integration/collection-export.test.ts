import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteLibraryTransfer } from '../../src/infrastructure/sqlite/sqlite-library-transfer';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { exportCollection } from '../../src/main/markdown-export';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

const database = openDatabase(':memory:');
const notes = new SqliteNoteRepository(database);
const library = new SqliteLibraryRepository(database);
const transfer = new SqliteLibraryTransfer(database, notes);
let output: string;
afterAll(() => database.close());
beforeEach(async () => {
  output = await mkdtemp(path.join(tmpdir(), 'inknote-export-'));
});
afterEach(async () => {
  database.exec(
    'DELETE FROM note_revisions; DELETE FROM notes; DELETE FROM notebooks; DELETE FROM sync_outbox;',
  );
  await rm(output, { recursive: true, force: true });
});
function seed() {
  const work = library.createNotebook({ name: 'Trabajo' });
  const child = library.createNotebook({ name: 'Web', parentId: work.id });
  const other = library.createNotebook({ name: 'Casa' });
  const note = (title: string, notebookId: string | null) =>
    notes.create({
      title,
      body: `cuerpo ${title}`,
      metadata: { ...defaultNoteMetadata, notebookId },
    });
  const inWork = note('Plan', work.id);
  const inChild = note('Sitio', child.id);
  const elsewhere = note('Compras', other.id);
  const trashed = note('Borrada', work.id);
  notes.moveToTrash(trashed.id);
  return { work, inWork, inChild, elsewhere, trashed };
}
const tree = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(directory, path.join(entry.parentPath, entry.name)),
    )
    .sort();
const renderHtml = vi.fn(async (note: { title: string }) => ({
  html: `<h1>${note.title}</h1>`,
  missingAttachments: 1,
}));

describe('exporting note collections', () => {
  it('exports one notebook with its sub-notebooks and skips the rest', async () => {
    const { work } = seed();
    const result = await exportCollection(
      transfer,
      output,
      path.join(output, 'x'),
      {
        format: 'markdown',
        scope: { kind: 'notebook', id: work.id },
      },
    );
    expect(result).toMatchObject({ notes: 2, missingAttachments: 0 });
    expect(path.basename(result!.path!)).toBe('Trabajo');
    expect(await tree(result!.path!)).toEqual([
      'Plan.md',
      path.join('Web', 'Sitio.md'),
    ]);
  });
  it('exports only the selected notes', async () => {
    const { inWork, elsewhere, trashed } = seed();
    const result = await exportCollection(
      transfer,
      output,
      path.join(output, 'x'),
      {
        format: 'markdown',
        scope: { kind: 'notes', ids: [inWork.id, elsewhere.id, trashed.id] },
      },
    );
    expect(result?.notes).toBe(2);
    expect(await tree(result!.path!)).toEqual(['Compras.md', 'Plan.md']);
  });
  it('writes HTML for every scope and adds up missing attachments', async () => {
    seed();
    const result = await exportCollection(
      transfer,
      output,
      path.join(output, 'x'),
      {
        format: 'html',
        scope: { kind: 'all' },
        renderHtml,
      },
    );
    expect(result).toMatchObject({ notes: 3, missingAttachments: 3 });
    expect(path.basename(result!.path!)).toBe('InkNote HTML');
    const files = await tree(result!.path!);
    expect(files).toContain(path.join('Trabajo', 'Web', 'Sitio.html'));
    expect(
      await readFile(path.join(result!.path!, 'Casa', 'Compras.html'), 'utf8'),
    ).toBe('<h1>Compras</h1>');
  });
  it('leaves nothing behind when there is nothing to export', async () => {
    const empty = library.createNotebook({ name: 'Vacío' });
    await expect(
      exportCollection(transfer, output, path.join(output, 'x'), {
        format: 'markdown',
        scope: { kind: 'notebook', id: empty.id },
      }),
    ).resolves.toBeNull();
    expect(await readdir(output)).toEqual([]);
  });
  it('reports a notebook that no longer exists', async () => {
    await expect(
      exportCollection(transfer, output, path.join(output, 'x'), {
        format: 'markdown',
        scope: { kind: 'notebook', id: '7a5115f8-747f-416d-82d5-d9c12e34d323' },
      }),
    ).resolves.toBeNull();
  });
});
