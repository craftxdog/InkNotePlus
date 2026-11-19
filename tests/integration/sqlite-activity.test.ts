import { afterEach, describe, expect, it } from 'vitest';
import {
  openDatabase,
  applyMigrations,
} from '../../src/infrastructure/sqlite/database';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';

const noteId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-11-18T12:00:00.000Z');

describe('library activity', () => {
  const database = openDatabase(':memory:');
  applyMigrations(database);
  const repository = new SqliteLibraryRepository(database);
  afterEach(() => {
    database.exec('DELETE FROM note_revisions; DELETE FROM notes;');
  });

  const revision = (number: number, at: string, status: string) =>
    database
      .prepare(
        `INSERT INTO note_revisions(note_id,revision,title,body,created_at,metadata_json)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(noteId, number, 'T', 'B', at, JSON.stringify({ status }));

  function seed() {
    database
      .prepare(
        `INSERT INTO notes(id,title,body,is_pinned,created_at,updated_at,revision)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        noteId,
        'T',
        'B',
        0,
        '2026-11-16T10:00:00.000Z',
        '2026-11-16T10:00:00.000Z',
        3,
      );
  }

  it('groups edits, new notes and completed tasks by day', () => {
    seed();
    revision(1, '2026-11-16T10:00:00.000Z', 'active');
    revision(2, '2026-11-16T11:00:00.000Z', 'active');
    revision(3, '2026-11-17T09:00:00.000Z', 'completed');
    expect(repository.getActivity({ offsetMinutes: 0 }, now)).toEqual([
      { date: '2026-11-16', edited: 1, created: 1, completed: 0 },
      { date: '2026-11-17', edited: 1, created: 0, completed: 1 },
    ]);
  });

  it('uses the local day of the user', () => {
    seed();
    revision(1, '2026-11-17T02:00:00.000Z', 'none');
    expect(repository.getActivity({ offsetMinutes: -360 }, now)[0].date).toBe(
      '2026-11-16',
    );
  });

  it('counts a task once when it stays completed', () => {
    seed();
    revision(1, '2026-11-16T10:00:00.000Z', 'completed');
    revision(2, '2026-11-16T11:00:00.000Z', 'completed');
    expect(repository.getActivity({ offsetMinutes: 0 }, now)[0].completed).toBe(
      1,
    );
  });
});
