import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { migrations } from '../../src/infrastructure/sqlite/migrations';
import {
  NotebookMoveError,
  SqliteLibraryRepository,
} from '../../src/infrastructure/sqlite/sqlite-library-repository';
import {
  notebookRecordSchema,
  SqliteLibraryTransfer,
} from '../../src/infrastructure/sqlite/sqlite-library-transfer';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

const database = openDatabase(':memory:');
const library = new SqliteLibraryRepository(database);
const notes = new SqliteNoteRepository(database);
afterAll(() => database.close());
afterEach(() => {
  database.exec(
    'DELETE FROM note_revisions; DELETE FROM notes; DELETE FROM notebooks; DELETE FROM sync_outbox;',
  );
});
const names = (parentId: string | null = null) =>
  library
    .getSnapshot()
    .notebooks.filter((book) => book.parentId === parentId)
    .map(({ name }) => name);

it('renames a notebook and reports a missing one', () => {
  const book = library.createNotebook({ name: 'Viejo' });
  expect(library.renameNotebook({ id: book.id, name: 'Nuevo' })).toBe(true);
  expect(names()).toEqual(['Nuevo']);
  expect(
    library.renameNotebook({
      id: '7a5115f8-747f-416d-82d5-d9c12e34d323',
      name: 'Nadie',
    }),
  ).toBe(false);
});

it('appends new notebooks and keeps the manual order among siblings', () => {
  const zeta = library.createNotebook({ name: 'Zeta' });
  const alfa = library.createNotebook({ name: 'Alfa' });
  const beta = library.createNotebook({ name: 'Beta' });
  expect(names()).toEqual(['Zeta', 'Alfa', 'Beta']);
  library.moveNotebook({ id: beta.id, parentId: null, beforeId: zeta.id });
  expect(names()).toEqual(['Beta', 'Zeta', 'Alfa']);
  library.moveNotebook({ id: beta.id, parentId: null, beforeId: null });
  expect(names()).toEqual(['Zeta', 'Alfa', 'Beta']);
  library.moveNotebook({ id: alfa.id, parentId: null, beforeId: zeta.id });
  expect(names()).toEqual(['Alfa', 'Zeta', 'Beta']);
});

it('moves a notebook with its subtree and keeps its notes', () => {
  const work = library.createNotebook({ name: 'Trabajo' });
  const child = library.createNotebook({ name: 'Hijo', parentId: work.id });
  const home = library.createNotebook({ name: 'Casa' });
  const note = notes.create({
    title: 'Dentro',
    body: '',
    metadata: { ...defaultNoteMetadata, notebookId: child.id },
  });
  library.moveNotebook({ id: work.id, parentId: home.id, beforeId: null });
  expect(names()).toEqual(['Casa']);
  expect(names(home.id)).toEqual(['Trabajo']);
  expect(names(work.id)).toEqual(['Hijo']);
  expect(notes.findById(note.id)?.metadata?.notebookId).toBe(child.id);
  expect(notes.findById(note.id)?.revision).toBe(note.revision);
});

it('rejects moving a notebook into itself or a descendant', () => {
  const parent = library.createNotebook({ name: 'Padre' });
  const child = library.createNotebook({ name: 'Hijo', parentId: parent.id });
  for (const target of [parent.id, child.id])
    expect(() =>
      library.moveNotebook({ id: parent.id, parentId: target, beforeId: null }),
    ).toThrow(NotebookMoveError);
  expect(names()).toEqual(['Padre']);
  expect(names(parent.id)).toEqual(['Hijo']);
});

it('rejects a sibling anchor from another parent', () => {
  const first = library.createNotebook({ name: 'Uno' });
  const other = library.createNotebook({ name: 'Dos' });
  const nested = library.createNotebook({ name: 'Tres', parentId: other.id });
  expect(() =>
    library.moveNotebook({ id: first.id, parentId: null, beforeId: nested.id }),
  ).toThrow(NotebookMoveError);
});

it('moves active notes between notebooks and skips no-ops and trashed notes', () => {
  const book = library.createNotebook({ name: 'Destino' });
  const moved = notes.create({ title: 'Mover', body: '' });
  const same = notes.create({
    title: 'Igual',
    body: '',
    metadata: { ...defaultNoteMetadata, notebookId: book.id },
  });
  const trashed = notes.create({ title: 'Borrada', body: '' });
  notes.moveToTrash(trashed.id);
  expect(
    notes.manageTrash({
      action: 'move',
      ids: [moved.id, same.id, trashed.id],
      notebookId: book.id,
    }),
  ).toBe(1);
  expect(notes.findById(moved.id)?.metadata?.notebookId).toBe(book.id);
  expect(notes.findById(same.id)?.revision).toBe(same.revision);
  expect(notes.findById(trashed.id)?.metadata?.notebookId).toBeNull();
  expect(
    notes.manageTrash({ action: 'move', ids: [moved.id], notebookId: null }),
  ).toBe(1);
  expect(notes.findById(moved.id)?.metadata?.notebookId).toBeNull();
});

it('keeps the alphabetical order when upgrading an existing library', () => {
  const legacy = new DatabaseSync(':memory:');
  for (const { version, sql } of migrations) if (version < 7) legacy.exec(sql);
  const insert = legacy.prepare(
    "INSERT INTO notebooks(id,name,parent_id,created_at) VALUES (?,?,NULL,'2026-01-01T00:00:00.000Z')",
  );
  insert.run('c', 'zeta');
  insert.run('a', 'Beta');
  insert.run('b', 'alfa');
  legacy.exec(migrations.find(({ version }) => version === 7)!.sql);
  expect(
    legacy
      .prepare('SELECT name FROM notebooks ORDER BY position')
      .all()
      .map(({ name }) => name),
  ).toEqual(['alfa', 'Beta', 'zeta']);
  legacy.close();
});

it('backs up the manual order and still reads backups without it', () => {
  const first = library.createNotebook({ name: 'Primero' });
  const second = library.createNotebook({ name: 'Segundo' });
  library.moveNotebook({ id: second.id, parentId: null, beforeId: first.id });
  const transfer = new SqliteLibraryTransfer(database, notes);
  const records = transfer.listNotebooks();
  database.exec('DELETE FROM notebooks');
  transfer.restore(records, []);
  expect(names()).toEqual(['Segundo', 'Primero']);
  expect(
    notebookRecordSchema.parse({
      id: first.id,
      name: 'Antiguo',
      parentId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      icon: 'book-open',
    }).position,
  ).toBe(0);
});
