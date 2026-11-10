import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  openDatabase,
  applyMigrations,
} from '../../src/infrastructure/sqlite/database';
import { migrations } from '../../src/infrastructure/sqlite/migrations';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';
import { SqliteSyncOutbox } from '../../src/infrastructure/sqlite/sqlite-sync-outbox';

describe('persistent shell library', () => {
  it('upgrades existing version 2 notes without changing their text or revision', () => {
    const legacy = new DatabaseSync(':memory:');
    try {
      legacy.exec(
        'CREATE TABLE inknote_schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT',
      );
      for (const migration of migrations.filter(({ version }) => version < 3)) {
        legacy.exec(migration.sql);
        legacy
          .prepare('INSERT INTO inknote_schema_migrations VALUES (?, ?)')
          .run(migration.version, new Date().toISOString());
      }
      legacy
        .prepare(
          'INSERT INTO notes(id,title,body,is_pinned,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,?)',
        )
        .run(
          '5a5115f8-747f-416d-82d5-d9c12e34d323',
          'Existing title',
          'Existing body',
          0,
          '2026-10-30T12:00:00.000Z',
          '2026-10-30T12:00:00.000Z',
          7,
        );
      applyMigrations(legacy);
      applyMigrations(legacy);
      expect(new SqliteNoteRepository(legacy).list()[0]).toMatchObject({
        title: 'Existing title',
        body: 'Existing body',
        revision: 7,
        metadata: { ...defaultNoteMetadata, status: 'active' },
      });
    } finally {
      legacy.close();
    }
  });
  it('migrates existing tags from active and trashed notes without changing their revisions', () => {
    const legacy = new DatabaseSync(':memory:');
    try {
      legacy.exec(
        'CREATE TABLE inknote_schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT',
      );
      const now = '2026-10-30T12:00:00.000Z';
      for (const migration of migrations.filter(
        ({ version }) => version <= 4,
      )) {
        legacy.exec(migration.sql);
        legacy
          .prepare('INSERT INTO inknote_schema_migrations VALUES (?, ?)')
          .run(migration.version, now);
      }
      const insert = legacy.prepare(
        'INSERT INTO notes(id,title,created_at,updated_at,deleted_at,revision,metadata_json) VALUES (?,?,?,?,?,?,?)',
      );
      insert.run(
        '5a5115f8-747f-416d-82d5-d9c12e34d323',
        'Active',
        now,
        now,
        null,
        7,
        JSON.stringify({ ...defaultNoteMetadata, tags: ['__proto__'] }),
      );
      insert.run(
        '6a5115f8-747f-416d-82d5-d9c12e34d323',
        'Trash',
        now,
        now,
        now,
        9,
        JSON.stringify({ ...defaultNoteMetadata, tags: ['Archived'] }),
      );
      applyMigrations(legacy);
      const library = new SqliteLibraryRepository(legacy);
      const notes = new SqliteNoteRepository(legacy);
      expect(library.getSnapshot().tags).toEqual(
        [
          { name: 'Archived', count: 0 },
          { name: '__proto__', count: 1 },
        ].sort((a, b) =>
          a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
        ),
      );
      expect(notes.list()[0]?.revision).toBe(7);
      expect(notes.list({ trashed: true })[0]?.revision).toBe(9);
      library.updateTag({
        name: '__proto__',
        nextName: '__proto__',
        color: 'violet',
      });
      expect(library.getSnapshot().tagColors).toEqual([
        { name: '__proto__', color: 'violet' },
      ]);
    } finally {
      legacy.close();
    }
  });
  const database = openDatabase(':memory:');
  afterAll(() => database.close());
  afterEach(() => {
    database.exec(
      'DELETE FROM note_revisions; DELETE FROM notes; DELETE FROM notebooks; DELETE FROM tags; DELETE FROM sync_outbox;',
    );
  });
  it('stores notebook hierarchy and counts note metadata from SQLite', () => {
    const library = new SqliteLibraryRepository(database);
    const work = library.createNotebook({ name: 'Work', parentId: null });
    const child = library.createNotebook({
      name: 'Projects',
      parentId: work.id,
    });
    const notes = new SqliteNoteRepository(database);
    const note = notes.create({
      title: 'Task',
      body: '- [ ] done',
      metadata: {
        ...defaultNoteMetadata,
        notebookId: child.id,
        status: 'onhold',
        tags: ['work', 'bug'],
      },
    });
    expect(library.getSnapshot()).toMatchObject({
      total: 1,
      statuses: { active: 0, onhold: 1 },
      tags: expect.arrayContaining([
        { name: 'work', count: 1 },
        { name: 'bug', count: 1 },
      ]),
    });
    expect(
      library.getSnapshot().notebooks.find(({ id }) => id === child.id),
    ).toMatchObject({ parentId: work.id, count: 1 });
    const updated = notes.update({
      id: note.id,
      title: note.title,
      body: note.body,
      expectedRevision: note.revision,
      metadata: { ...note.metadata!, status: 'completed' },
      isPinned: true,
    });
    expect(notes.list()[0]).toMatchObject({
      metadata: { status: 'completed' },
      isPinned: true,
    });
    expect(library.getSnapshot().statuses.completed).toBe(1);
    notes.moveToTrash(updated.id);
    expect(library.getSnapshot()).toMatchObject({ total: 0, trash: 1 });
    expect(notes.list({ trashed: true })).toHaveLength(1);
  });
  it('rejects a notebook whose parent does not exist', () => {
    expect(() =>
      new SqliteLibraryRepository(database).createNotebook({
        name: 'Child',
        parentId: '5a5115f8-747f-416d-82d5-d9c12e34d323',
      }),
    ).toThrow();
  });
  it('persists notebook icons and sorts every search page by the chosen order, keeping pins first', () => {
    const library = new SqliteLibraryRepository(database);
    const notes = new SqliteNoteRepository(database);
    const book = library.createNotebook({ name: 'Work', icon: 'briefcase' });
    library.setNotebookIcon({ id: book.id, icon: 'rocket' });
    expect(library.getSnapshot().notebooks[0].icon).toBe('rocket');
    for (let index = 55; index >= 0; index--)
      notes.create({
        title: `Item ${String(index).padStart(2, '0')}`,
        body: 'needle',
      });
    const pinned = notes.create({ title: 'Z pinned', body: 'needle' });
    notes.update({
      id: pinned.id,
      title: pinned.title,
      body: pinned.body,
      expectedRevision: 1,
      isPinned: true,
    });
    const first = notes.search({ query: 'needle', sort: 'title', limit: 50 });
    const second = notes.search({ query: 'needle', sort: 'title', offset: 50 });
    expect(first[0].title).toBe('Z pinned');
    expect([...first, ...second].slice(1).map((note) => note.title)).toEqual(
      Array.from(
        { length: 56 },
        (_, index) => `Item ${String(index).padStart(2, '0')}`,
      ),
    );
  });
  it('combines notebook, status, tag and full-text filters without mixing sections', () => {
    const library = new SqliteLibraryRepository(database);
    const book = library.createNotebook({ name: 'Work' });
    const notes = new SqliteNoteRepository(database);
    const matching = notes.create({
      title: 'Shared task',
      body: 'content',
      metadata: {
        ...defaultNoteMetadata,
        notebookId: book.id,
        status: 'active',
        tags: ['bug'],
        isTemplate: true,
      },
    });
    notes.create({
      title: 'Shared other',
      body: 'content',
      metadata: { ...defaultNoteMetadata, status: 'completed', tags: ['bug'] },
    });
    expect(
      notes
        .list({
          notebookId: book.id,
          status: 'active',
          tag: 'bug',
          templates: true,
        })
        .map((n) => n.id),
    ).toEqual([matching.id]);
    expect(
      notes
        .search({ query: 'shared', notebookId: book.id, tag: 'bug' })
        .map((n) => n.id),
    ).toEqual([matching.id]);
    expect(notes.list({ notebookId: null })).toHaveLength(1);
    expect(notes.list({ tag: "bug' OR 1=1 --" })).toEqual([]);
    expect(new SqliteSyncOutbox(database).listPending()[0]).toMatchObject({
      kind: 'upsert',
      payload: { metadata: matching.metadata },
    });
  });
  it('rejects orphan note metadata before committing a note or outbox entry', () => {
    const notes = new SqliteNoteRepository(database);
    expect(() =>
      notes.create({
        title: 'Orphan',
        body: '',
        metadata: {
          ...defaultNoteMetadata,
          notebookId: '5a5115f8-747f-416d-82d5-d9c12e34d323',
        },
      }),
    ).toThrow('Notebook does not exist.');
    expect(notes.list()).toEqual([]);
    expect(
      database.prepare('SELECT count(*) AS count FROM sync_outbox').get(),
    ).toMatchObject({ count: 0 });
  });
  it('scopes Detail counts, tags and filtered search to the selected subtree, including totals beyond a page', () => {
    const library = new SqliteLibraryRepository(database);
    const notes = new SqliteNoteRepository(database);
    const parent = library.createNotebook({ name: 'Parent' });
    const child = library.createNotebook({
      name: 'Child',
      parentId: parent.id,
    });
    notes.create({
      title: 'Outside',
      body: '',
      metadata: { ...defaultNoteMetadata, tags: ['outside'] },
    });
    for (let index = 0; index < 53; index++)
      notes.create({
        title: `Scoped ${index}`,
        body: 'needle',
        metadata: {
          ...defaultNoteMetadata,
          notebookId: child.id,
          tags: ['inside'],
          status: 'completed',
        },
      });
    expect(notes.list({ notebookId: parent.id })).toHaveLength(0);
    expect(
      notes.list({ notebookId: parent.id, includeDescendants: true }),
    ).toHaveLength(50);
    expect(notes.list({ scopeId: parent.id, offset: 50 })).toHaveLength(3);
    expect(
      library.getSnapshot({
        scopeId: parent.id,
        query: 'needle',
        filter: { status: 'completed' },
      }),
    ).toMatchObject({
      total: 53,
      matching: 53,
      unfiled: 0,
      statuses: { active: 0, completed: 53 },
      tags: [{ name: 'inside', count: 53 }],
    });
    expect(
      library.getSnapshot().notebooks.find((book) => book.id === parent.id),
    ).toMatchObject({ count: 0, descendantCount: 53 });
    expect(
      notes.search({ query: 'needle', scopeId: parent.id, status: 'active' }),
    ).toEqual([]);
  });
});
