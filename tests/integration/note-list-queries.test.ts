import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { noteSortSchema } from '../../src/shared/ipc';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';
import { preferencesSchema } from '../../src/shared/preferences';

const database = openDatabase(':memory:');
const notes = new SqliteNoteRepository(database);
const library = new SqliteLibraryRepository(database);
afterAll(() => database.close());
afterEach(() => {
  database.exec(
    'DELETE FROM note_revisions; DELETE FROM notes; DELETE FROM notebooks; DELETE FROM sync_outbox; DELETE FROM tags;',
  );
});
const tagged = (title: string, tags: string[], body = '') =>
  notes.create({
    title,
    body,
    metadata: { ...defaultNoteMetadata, tags },
  });
const dated = (title: string, created: number, updated: number) => {
  const note = notes.create({ title, body: 'needle' });
  database
    .prepare('UPDATE notes SET created_at=?, updated_at=? WHERE id=?')
    .run(
      new Date(Date.UTC(2026, 0, created)).toISOString(),
      new Date(Date.UTC(2026, 0, updated)).toISOString(),
      note.id,
    );
  return note;
};

describe('note ordering', () => {
  it.each([
    ['updated-desc', ['beta', 'Alfa', 'gamma']],
    ['updated-asc', ['gamma', 'Alfa', 'beta']],
    ['created-desc', ['gamma', 'beta', 'Alfa']],
    ['created-asc', ['Alfa', 'beta', 'gamma']],
    ['title-asc', ['Alfa', 'beta', 'gamma']],
    ['title-desc', ['gamma', 'beta', 'Alfa']],
  ] as const)('sorts by %s in lists and explicit searches', (sort, titles) => {
    dated('Alfa', 1, 5);
    dated('beta', 2, 9);
    dated('gamma', 3, 1);
    expect(notes.list({ sort }).map(({ title }) => title)).toEqual(titles);
    if (sort !== 'updated-desc')
      expect(
        notes.search({ query: 'needle', sort }).map(({ title }) => title),
      ).toEqual(titles);
  });
  it('keeps pinned notes first under every order', () => {
    dated('Alfa', 1, 1);
    const pinned = dated('Zeta', 2, 2);
    database.prepare('UPDATE notes SET is_pinned=1 WHERE id=?').run(pinned.id);
    expect(notes.list({ sort: 'title-asc' })[0].title).toBe('Zeta');
  });
  it('still ranks keyword searches by relevance under the default order', () => {
    notes.create({
      title: 'Poco',
      body: 'needle y mucho texto de relleno aquí',
    });
    notes.create({ title: 'needle needle', body: 'needle needle needle' });
    expect(
      notes.search({ query: 'needle', sort: 'updated-desc' })[0].title,
    ).toBe('needle needle');
  });
  it('reads the orders saved by earlier versions', () => {
    expect(noteSortSchema.parse('updated')).toBe('updated-desc');
    expect(noteSortSchema.parse('title')).toBe('title-asc');
    expect(preferencesSchema.parse({ noteSort: 'title' }).noteSort).toBe(
      'title-asc',
    );
    expect(noteSortSchema.safeParse('random').success).toBe(false);
  });
});

describe('filtering by several tags', () => {
  it('narrows lists, searches and counts to notes with every tag', () => {
    tagged('Ambas', ['alfa', 'beta'], 'needle');
    tagged('Una', ['alfa'], 'needle');
    tagged('Otra', ['beta'], 'needle');
    const filter = { tags: ['alfa', 'beta'] };
    expect(notes.list(filter).map(({ title }) => title)).toEqual(['Ambas']);
    expect(
      notes.search({ ...filter, query: 'needle' }).map(({ title }) => title),
    ).toEqual(['Ambas']);
    expect(library.getSnapshot({ filter }).matching).toBe(1);
  });
});

describe('bulk note changes', () => {
  it('changes the status of active notes only', () => {
    const first = tagged('Uno', []);
    const same = notes.create({
      title: 'Igual',
      body: '',
      metadata: { ...defaultNoteMetadata, status: 'onhold' },
    });
    const trashed = tagged('Borrada', []);
    notes.moveToTrash(trashed.id);
    expect(
      notes.manageTrash({
        action: 'status',
        ids: [first.id, same.id, trashed.id],
        status: 'onhold',
      }),
    ).toBe(1);
    expect(notes.findById(first.id)?.metadata?.status).toBe('onhold');
    expect(notes.findById(same.id)?.revision).toBe(same.revision);
    expect(notes.findById(trashed.id)?.metadata?.status).toBe('none');
  });
  it('adds and removes tags without duplicating existing ones', () => {
    const first = tagged('Uno', ['viejo', 'comun']);
    const second = tagged('Dos', ['comun']);
    const untouched = tagged('Tres', ['nuevo']);
    expect(
      notes.manageTrash({
        action: 'tag',
        ids: [first.id, second.id, untouched.id],
        add: ['nuevo'],
        remove: ['viejo'],
      }),
    ).toBe(2);
    expect(notes.findById(first.id)?.metadata?.tags).toEqual([
      'comun',
      'nuevo',
    ]);
    expect(notes.findById(second.id)?.metadata?.tags).toEqual([
      'comun',
      'nuevo',
    ]);
    expect(notes.findById(untouched.id)?.revision).toBe(untouched.revision);
    expect(library.getSnapshot().tags.map(({ name }) => name)).toContain(
      'nuevo',
    );
  });
  it('rolls back every note when one would exceed the tag limit', () => {
    const small = tagged('Pequeña', []);
    const full = tagged(
      'Llena',
      Array.from({ length: 32 }, (_, index) => `t${index}`),
    );
    expect(() =>
      notes.manageTrash({
        action: 'tag',
        ids: [small.id, full.id],
        add: ['extra'],
        remove: [],
      }),
    ).toThrow();
    expect(notes.findById(small.id)?.metadata?.tags).toEqual([]);
  });
});
