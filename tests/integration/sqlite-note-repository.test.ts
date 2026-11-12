import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

import {
  applyMigrations,
  openDatabase,
} from '../../src/infrastructure/sqlite/database';
import {
  NoteConflictError,
  NoteNotFoundError,
} from '../../src/domain/note-repository';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';

describe('SqliteNoteRepository', () => {
  let database: DatabaseSync;
  let repository: SqliteNoteRepository;

  beforeEach(() => {
    database = openDatabase(':memory:');
    repository = new SqliteNoteRepository(database);
  });

  afterEach(() => {
    database.close();
  });

  it('applies migrations exactly once', () => {
    applyMigrations(database);

    const migrations = database
      .prepare('SELECT version FROM inknote_schema_migrations ORDER BY version')
      .all() as Array<{ version: number }>;

    expect(migrations).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
    ]);
  });

  it('creates a note and stores its first revision atomically', () => {
    const note = repository.create({
      title: 'Architecture',
      body: 'Local-first with SQLite.',
    });

    const revisions = database
      .prepare('SELECT revision FROM note_revisions WHERE note_id = ?')
      .all(note.id) as Array<{ revision: number }>;

    expect(note).toMatchObject({
      title: 'Architecture',
      body: 'Local-first with SQLite.',
      deletedAt: null,
      revision: 1,
    });
    expect(revisions).toEqual([{ revision: 1 }]);
  });

  it('rolls back a note when recording its sync operation fails', () => {
    const repositoryWithFailingOutbox = new SqliteNoteRepository(database, {
      recordNote: () => {
        throw new Error('Sync outbox unavailable.');
      },
    });

    expect(() =>
      repositoryWithFailingOutbox.create({ title: 'Draft', body: '' }),
    ).toThrow('Sync outbox unavailable.');
    expect(repository.list()).toEqual([]);
    expect(
      database.prepare('SELECT operation_id FROM sync_outbox').all(),
    ).toEqual([]);
  });

  it('updates a note with optimistic revision control and indexes the new body', () => {
    const created = repository.create({ title: 'Draft', body: 'old content' });

    const updated = repository.update({
      id: created.id,
      title: 'Architecture',
      body: 'new searchable content',
      expectedRevision: created.revision,
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: 'Architecture',
      body: 'new searchable content',
      revision: 2,
    });
    expect(repository.search({ query: 'searchable' })).toEqual([
      expect.objectContaining({ id: created.id, revision: 2 }),
    ]);
    expect(repository.search({ query: 'old' })).toEqual([]);
    expect(() =>
      repository.update({
        id: created.id,
        title: 'Stale write',
        body: 'This must not persist.',
        expectedRevision: created.revision,
      }),
    ).toThrow(NoteConflictError);
  });

  it('searches note content and excludes trashed notes', () => {
    const matchingNote = repository.create({
      title: 'Security',
      body: 'Validate every IPC boundary.',
    });
    const trashedNote = repository.create({
      title: 'Old security draft',
      body: 'Validate every IPC boundary.',
    });

    repository.moveToTrash(trashedNote.id);

    expect(repository.search({ query: 'IPC boundary' })).toEqual([
      expect.objectContaining({ id: matchingNote.id }),
    ]);
  });

  it('moves a note to trash and restores it with new revisions', () => {
    const note = repository.create({ title: 'Inbox', body: '' });

    const trashed = repository.moveToTrash(note.id);
    const restored = repository.restore(note.id);

    expect(trashed).toMatchObject({
      deletedAt: expect.any(String),
      revision: 2,
    });
    expect(restored).toMatchObject({ deletedAt: null, revision: 3 });
    expect(repository.list()).toEqual([
      expect.objectContaining({ id: note.id, revision: 3 }),
    ]);
  });

  it('does not update a note that is in the trash', () => {
    const note = repository.create({ title: 'Inbox', body: '' });
    const trashed = repository.moveToTrash(note.id);

    expect(() =>
      repository.update({
        id: note.id,
        title: 'Should stay hidden',
        body: '',
        expectedRevision: trashed.revision,
      }),
    ).toThrow(NoteNotFoundError);
  });

  it('treats FTS syntax as note text instead of executable query syntax', () => {
    repository.create({
      title: 'Literal operator',
      body: 'OR must stay text.',
    });

    expect(() => repository.search({ query: 'OR *' })).not.toThrow();
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes'",
        )
        .get(),
    ).toBeDefined();
  });
});
