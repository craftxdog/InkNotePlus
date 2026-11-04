import { afterAll, afterEach, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

const database = openDatabase(':memory:');
afterAll(() => database.close());
afterEach(() => {
  database.exec(
    'DELETE FROM note_revisions; DELETE FROM notes; DELETE FROM notebooks; DELETE FROM sync_outbox;',
  );
});
it('defaults new notes to None, preserves finished records and hides them only in notebook browsing', () => {
  const notes = new SqliteNoteRepository(database);
  const library = new SqliteLibraryRepository(database);
  const book = library.createNotebook({ name: 'Work' });
  const initial = notes.create({ title: 'Untracked', body: '' });
  expect(initial.metadata?.status).toBe('none');
  notes.create({
    title: 'Working',
    body: 'shared',
    metadata: { ...defaultNoteMetadata, notebookId: book.id, status: 'active' },
  });
  notes.create({
    title: 'Done',
    body: 'shared',
    metadata: {
      ...defaultNoteMetadata,
      notebookId: book.id,
      status: 'completed',
    },
  });
  expect(
    notes.list({ notebookId: book.id, excludeFinished: true }),
  ).toHaveLength(1);
  expect(
    notes.search({
      query: 'status:completed',
      notebookId: book.id,
      excludeFinished: true,
    }),
  ).toHaveLength(1);
  expect(notes.list()).toHaveLength(3);
  expect(library.getSnapshot().statuses.none).toBe(1);
});
it('matches qualified phrases and exclusions with identical list and count filters', () => {
  const notes = new SqliteNoteRepository(database);
  const library = new SqliteLibraryRepository(database);
  const book = library.createNotebook({ name: 'Team notes' });
  const matching = notes.create({
    title: 'JavaScript setTimeout',
    body: 'closure functions debounce',
    metadata: {
      ...defaultNoteMetadata,
      notebookId: book.id,
      tags: ['work'],
      status: 'onhold',
    },
  });
  notes.create({
    title: 'JavaScript setTimeout',
    body: 'closure and functions debounce',
    metadata: {
      ...defaultNoteMetadata,
      notebookId: book.id,
      tags: ['work'],
      status: 'completed',
    },
  });
  notes.create({
    title: 'Other',
    body: 'closure functions debounce',
    metadata: { ...defaultNoteMetadata, tags: ['work'], status: 'onhold' },
  });
  const query =
    'book:"Team notes" tag:work status:onHold title:"JavaScript setTimeout" "closure functions" -body:missing';
  expect(notes.search({ query }).map((note) => note.id)).toEqual([matching.id]);
  expect(library.getSnapshot({ query }).matching).toBe(1);
  expect(
    notes.search({ query: '-book:"Team notes" "closure functions"' }),
  ).toHaveLength(1);
  expect(notes.search({ query: 'tag:work' })).toHaveLength(3);
  expect(
    notes.search({ query: 'book:"Team notes" -"closure functions" debounce' }),
  ).toHaveLength(1);
  expect(notes.search({ query: '"closure functions" -tag:work' })).toEqual([]);
  expect(notes.search({ query: 'title:"x\\" OR 1=1 --"' })).toEqual([]);
});
