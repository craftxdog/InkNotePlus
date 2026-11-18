import { afterAll, afterEach, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { NoteNotFoundError } from '../../src/domain/note-repository';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

const database = openDatabase(':memory:');
const notes = new SqliteNoteRepository(database);
afterAll(() => database.close());
afterEach(() => {
  database.exec(
    'DELETE FROM note_revisions; DELETE FROM notes; DELETE FROM sync_outbox;',
  );
});
function edited() {
  const first = notes.create({ title: 'Uno', body: 'a' });
  const second = notes.update({
    id: first.id,
    title: 'Uno',
    body: 'b',
    expectedRevision: first.revision,
  });
  // Metadata-only writes are not content versions.
  const moved = notes.update({
    id: first.id,
    title: 'Uno',
    body: 'b',
    expectedRevision: second.revision,
    metadata: { ...defaultNoteMetadata, status: 'active' },
  });
  const third = notes.update({
    id: first.id,
    title: 'Dos',
    body: 'b',
    expectedRevision: moved.revision,
  });
  return { first, second, third };
}

it('lists only the versions whose content changed, newest first', () => {
  const { first, second, third } = edited();
  expect(notes.listRevisions(first.id)).toEqual([
    expect.objectContaining({
      revision: third.revision,
      title: 'Dos',
      current: true,
    }),
    expect.objectContaining({
      revision: second.revision,
      title: 'Uno',
      current: false,
    }),
    expect.objectContaining({
      revision: first.revision,
      title: 'Uno',
      current: false,
    }),
  ]);
});

it('reads the content of one version', () => {
  const { first } = edited();
  expect(notes.getRevision(first.id, first.revision)).toMatchObject({
    revision: first.revision,
    title: 'Uno',
    body: 'a',
  });
});

it('reports missing notes and versions', () => {
  const { first } = edited();
  expect(() => notes.getRevision(first.id, 99)).toThrow(NoteNotFoundError);
  expect(() =>
    notes.listRevisions('5a5115f8-747f-416d-82d5-d9c12e34d323'),
  ).toThrow(NoteNotFoundError);
});
