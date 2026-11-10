import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { SqliteSyncOutbox } from '../../src/infrastructure/sqlite/sqlite-sync-outbox';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

let database: ReturnType<typeof openDatabase>;
let notes: SqliteNoteRepository;
let library: SqliteLibraryRepository;
let outbox: SqliteSyncOutbox;

beforeEach(() => {
  database = openDatabase(':memory:');
  outbox = new SqliteSyncOutbox(database);
  notes = new SqliteNoteRepository(database, outbox);
  library = new SqliteLibraryRepository(database, notes);
});

afterEach(() => database.close());

describe('notebooks and Trash', () => {
  it('moves a selection to Trash and restores it into the chosen notebook', () => {
    const destination = library.createNotebook({ name: 'Recovery' });
    const first = notes.create({
      title: 'First',
      body: 'Keep this text',
      metadata: { ...defaultNoteMetadata, tags: ['work'], status: 'completed' },
    });
    const second = notes.create({ title: 'Second', body: '' });
    const ids = [first.id, second.id];
    expect(notes.manageTrash({ action: 'trash', ids })).toBe(2);
    expect(notes.manageTrash({ action: 'trash', ids })).toBe(0);
    expect(notes.list()).toEqual([]);
    expect(library.getSnapshot().trash).toBe(2);
    expect(
      notes.manageTrash({ action: 'restore', ids, notebookId: destination.id }),
    ).toBe(2);
    expect(notes.list({ notebookId: destination.id })).toHaveLength(2);
    expect(notes.findById(first.id)).toMatchObject({
      body: 'Keep this text',
      deletedAt: null,
      revision: first.revision + 2,
      metadata: {
        notebookId: destination.id,
        tags: ['work'],
        status: 'completed',
      },
    });
  });

  it('deletes a whole notebook tree and keeps its notes recoverable in Trash', () => {
    const root = library.createNotebook({ name: 'Root' });
    const child = library.createNotebook({ name: 'Child', parentId: root.id });
    const survivor = library.createNotebook({ name: 'Survivor' });
    const add = (notebookId: string, title: string) =>
      notes.create({
        title,
        body: title,
        metadata: { ...defaultNoteMetadata, notebookId },
      });
    const direct = add(root.id, 'Direct');
    const nested = add(child.id, 'Nested');
    const trashed = notes.moveToTrash(add(child.id, 'Already in Trash').id);
    const outside = add(survivor.id, 'Outside');

    expect(library.deleteNotebook(root.id)).toEqual(
      expect.arrayContaining([root.id, child.id]),
    );
    expect(library.getSnapshot().notebooks.map(({ id }) => id)).toEqual([
      survivor.id,
    ]);
    expect(notes.list()).toEqual([outside]);
    expect(notes.list({ trashed: true }).map(({ id }) => id)).toEqual(
      expect.arrayContaining([direct.id, nested.id, trashed.id]),
    );
    expect(notes.findById(trashed.id)).toMatchObject({
      deletedAt: trashed.deletedAt,
      metadata: { notebookId: null },
    });
    notes.manageTrash({
      action: 'restore',
      ids: [nested.id],
      notebookId: survivor.id,
    });
    expect(notes.findById(nested.id)?.metadata?.notebookId).toBe(survivor.id);
  });

  it('permanently deletes only trashed notes and removes their revision and search records', () => {
    const active = notes.create({ title: 'Active', body: 'Keep' });
    const deleted = notes.moveToTrash(
      notes.create({ title: 'Secret', body: 'Forget this text' }).id,
    );
    const remaining = notes.moveToTrash(
      notes.create({ title: 'Another', body: '' }).id,
    );

    expect(() =>
      notes.manageTrash({ action: 'delete', ids: [deleted.id, active.id] }),
    ).toThrow();
    expect(notes.findById(deleted.id)).not.toBeNull();
    expect(notes.manageTrash({ action: 'delete', ids: [deleted.id] })).toBe(1);
    expect(notes.findById(deleted.id)).toBeNull();
    expect(notes.search({ query: 'Secret', trashed: true })).toEqual([]);
    expect(
      database
        .prepare('SELECT * FROM note_revisions WHERE note_id = ?')
        .all(deleted.id),
    ).toEqual([]);
    expect(
      outbox.listPending().filter(({ entity }) => entity.id === deleted.id),
    ).toEqual([expect.objectContaining({ kind: 'tombstone', payload: null })]);
    expect(notes.manageTrash({ action: 'empty' })).toBe(1);
    expect(notes.findById(remaining.id)).toBeNull();
    expect(notes.list()).toEqual([active]);
  });
});

describe('tag management', () => {
  it('renames a tag on active and trashed notes and persists the chosen color', () => {
    const metadata = { ...defaultNoteMetadata, tags: ['Work', 'Other'] };
    const active = notes.create({ title: 'Active', body: '', metadata });
    const trashed = notes.moveToTrash(
      notes.create({ title: 'Trash', body: '', metadata }).id,
    );
    expect(
      library.updateTag({
        name: 'Work',
        nextName: 'Projects',
        color: 'violet',
      }),
    ).toBe(true);

    expect(library.getSnapshot().tags).toContainEqual({
      name: 'Projects',
      count: 1,
      color: 'violet',
    });
    expect(notes.list({ tag: 'Work' })).toEqual([]);
    expect(notes.list({ tag: 'Projects' })[0]?.id).toBe(active.id);
    expect(notes.findById(trashed.id)).toMatchObject({
      deletedAt: trashed.deletedAt,
      metadata: { tags: ['Projects', 'Other'] },
    });
    expect(() =>
      library.updateTag({ name: 'Projects', nextName: 'Other', color: 'red' }),
    ).toThrow();
    expect(notes.findById(active.id)?.metadata?.tags).toEqual([
      'Projects',
      'Other',
    ]);
  });

  it('removes a deleted tag from all notes and keeps their other tags', () => {
    const metadata = { ...defaultNoteMetadata, tags: ['delete me', 'keep me'] };
    const active = notes.create({ title: 'Active', body: '', metadata });
    const trashed = notes.moveToTrash(
      notes.create({ title: 'Trash', body: '', metadata }).id,
    );
    expect(library.deleteTag('delete me')).toBe(true);
    expect(library.deleteTag('delete me')).toBe(false);
    expect(library.getSnapshot().tags).toEqual([{ name: 'keep me', count: 1 }]);
    for (const id of [active.id, trashed.id]) {
      expect(notes.findById(id)?.metadata?.tags).toEqual(['keep me']);
    }
  });
});
