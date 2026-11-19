import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMigrations,
  openDatabase,
} from '../../../src/infrastructure/sqlite/database';
import { SqliteLibraryRepository } from '../../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteNoteRepository } from '../../../src/infrastructure/sqlite/sqlite-note-repository';
import { SqliteSyncStore } from '../../../src/infrastructure/sqlite/sqlite-sync-store';
import { createCouchClient } from '../../../src/main/sync/couch-client';
import { connectEncryption } from '../../../src/main/sync/connection';
import { runSync } from '../../../src/main/sync/engine';
import { defaultNoteMetadata } from '../../../src/shared/note-metadata';
import { noteSchema } from '../../../src/shared/ipc';
import { createFakeCouch } from '../../support/fake-couch';

// Set INKNOTE_COUCH_URL, _USER and _PASSWORD to run this suite against a real server.
const real = process.env.INKNOTE_COUCH_URL;
const server = real
  ? {
      url: real,
      username: process.env.INKNOTE_COUCH_USER ?? 'admin',
      password: process.env.INKNOTE_COUCH_PASSWORD ?? '',
      fetcher: fetch,
    }
  : (() => {
      const fake = createFakeCouch();
      return {
        url: 'http://127.0.0.1:5984',
        username: 'u',
        password: 'p',
        fetcher: fake.fetcher,
      };
    })();

const folders: string[] = [];
const closers: (() => void)[] = [];
let databaseName: string;

function device() {
  const userData = mkdtempSync(path.join(tmpdir(), 'inknote-sync-'));
  folders.push(userData);
  const database = openDatabase(':memory:');
  applyMigrations(database);
  closers.push(() => database.close());
  const notes = new SqliteNoteRepository(database);
  const library = new SqliteLibraryRepository(database, notes);
  const store = new SqliteSyncStore(database, notes, library, userData);
  const client = createCouchClient({
    url: server.url,
    username: server.username,
    password: server.password,
    database: databaseName,
    fetcher: server.fetcher,
  });
  let key: Buffer;
  return {
    notes,
    library,
    store,
    client,
    userData,
    database,
    async sync() {
      key ??= (await connectEncryption(client, 'frase de prueba', 1000)).key;
      return runSync({ client, store, key, targetId: 'test' });
    },
    list: () => notes.list({ limit: 100 }),
  };
}
const create = (
  target: ReturnType<typeof device>,
  title: string,
  body = 'Cuerpo',
) => target.notes.create({ title, body, metadata: defaultNoteMetadata });

beforeEach(() => {
  databaseName = `inknote_test_${randomUUID().replaceAll('-', '')}`;
});
afterEach(async () => {
  closers.splice(0).forEach((close) => close());
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
  if (real)
    await fetch(`${server.url}/${databaseName}`, {
      method: 'DELETE',
      headers: {
        authorization: `Basic ${btoa(`${server.username}:${server.password}`)}`,
      },
    });
});

describe('sync between two devices', () => {
  it('copies a new note to the other device', async () => {
    const a = device();
    const b = device();
    const note = create(a, 'Desde A', 'Texto privado');
    const first = await a.sync();
    expect(first.pushed).toBe(1);
    const second = await b.sync();
    expect(second.pulled).toBe(1);
    expect(b.notes.findById(note.id)).toMatchObject({
      title: 'Desde A',
      body: 'Texto privado',
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });
  });

  it('stores only encrypted content on the server', async () => {
    const a = device();
    create(a, 'Título muy secreto', 'Cuerpo muy secreto');
    await a.sync();
    const changes = await a.client.changes('0', 100);
    const text = JSON.stringify(changes.results);
    expect(text).not.toContain('secreto');
    expect(changes.results.some(({ id }) => id.startsWith('note:'))).toBe(true);
  });

  it('settles with nothing left to do', async () => {
    const a = device();
    const b = device();
    create(a, 'Una');
    await a.sync();
    await b.sync();
    expect(await a.sync()).toMatchObject({ pushed: 0, pulled: 0 });
    expect(await b.sync()).toMatchObject({ pushed: 0, pulled: 0 });
  });

  it('propagates edits both ways', async () => {
    const a = device();
    const b = device();
    const note = create(a, 'Original');
    await a.sync();
    await b.sync();
    const copy = b.notes.findById(note.id)!;
    b.notes.update({
      id: note.id,
      title: 'Editada en B',
      body: copy.body,
      expectedRevision: copy.revision,
    });
    await b.sync();
    await a.sync();
    expect(a.notes.findById(note.id)?.title).toBe('Editada en B');
  });

  it('applies a remote edit to a note with a notebook and tags', async () => {
    const a = device();
    const b = device();
    const book = a.library.createNotebook({ name: 'Libro' });
    const note = a.notes.create({
      title: 'Con datos',
      body: 'Base',
      metadata: {
        ...defaultNoteMetadata,
        notebookId: book.id,
        tags: ['viaja'],
      },
    });
    await a.sync();
    await b.sync();
    const copy = b.notes.findById(note.id)!;
    b.notes.update({
      id: note.id,
      title: copy.title,
      body: 'Editado en B',
      expectedRevision: copy.revision,
      metadata: copy.metadata,
    });
    await b.sync();
    await a.sync();
    expect(a.notes.findById(note.id)?.body).toBe('Editado en B');
  });

  it('keeps revision history when a remote edit arrives', async () => {
    const a = device();
    const b = device();
    const note = create(a, 'V1');
    await a.sync();
    await b.sync();
    const copy = b.notes.findById(note.id)!;
    b.notes.update({
      id: note.id,
      title: 'V2',
      body: copy.body,
      expectedRevision: copy.revision,
    });
    await b.sync();
    await a.sync();
    expect(a.notes.listRevisions(note.id).map(({ title }) => title)).toEqual([
      'V2',
      'V1',
    ]);
  });

  it('syncs the trash and permanent deletion', async () => {
    const a = device();
    const b = device();
    const note = create(a, 'Borrar');
    await a.sync();
    await b.sync();
    a.notes.moveToTrash(note.id);
    await a.sync();
    await b.sync();
    expect(b.notes.findById(note.id)?.deletedAt).not.toBeNull();
    a.notes.manageTrash({ action: 'delete', ids: [note.id] });
    await a.sync();
    await b.sync();
    expect(b.notes.findById(note.id)).toBeNull();
  });

  it('syncs notebooks with their hierarchy and tags with color', async () => {
    const a = device();
    const b = device();
    const parent = a.library.createNotebook({ name: 'Padre' });
    const child = a.library.createNotebook({
      name: 'Hijo',
      parentId: parent.id,
    });
    a.notes.create({
      title: 'Dentro',
      body: '',
      metadata: {
        ...defaultNoteMetadata,
        notebookId: child.id,
        tags: ['azul'],
      },
    });
    a.library.updateTag({ name: 'azul', nextName: 'azul', color: 'blue' });
    await a.sync();
    await b.sync();
    expect(b.library.getSnapshot().notebooks).toMatchObject(
      [
        { id: parent.id, name: 'Padre', parentId: null },
        { id: child.id, name: 'Hijo', parentId: parent.id },
      ]
        .sort((x, y) => x.name.localeCompare(y.name))
        .reverse()
        .reverse(),
    );
    expect(b.library.getSnapshot().tagColors).toEqual([
      { name: 'azul', color: 'blue' },
    ]);
    expect(b.list()[0].metadata?.notebookId).toBe(child.id);
  });

  it('removes a deleted notebook on the other device', async () => {
    const a = device();
    const b = device();
    const book = a.library.createNotebook({ name: 'Temporal' });
    await a.sync();
    await b.sync();
    a.library.deleteNotebook(book.id);
    await a.sync();
    await b.sync();
    expect(b.library.getSnapshot().notebooks).toEqual([]);
  });

  it('copies images and verifies their content', async () => {
    const a = device();
    const b = device();
    const bytes = Buffer.from('imagen de prueba');
    const name = `${createHash('sha256').update(bytes).digest('hex')}.png`;
    mkdirSync(path.join(a.userData, 'images'));
    writeFileSync(path.join(a.userData, 'images', name), bytes);
    await a.sync();
    await b.sync();
    expect(readFileSync(path.join(b.userData, 'images', name))).toEqual(bytes);
  });

  it('does not upload a received image again', async () => {
    const a = device();
    const b = device();
    const bytes = Buffer.from('imagen estable');
    const name = `${createHash('sha256').update(bytes).digest('hex')}.png`;
    mkdirSync(path.join(a.userData, 'images'));
    writeFileSync(path.join(a.userData, 'images', name), bytes);
    await a.sync();
    expect(await b.sync()).toMatchObject({ pushed: 0, pulled: 1 });
    expect(await a.sync()).toMatchObject({ pushed: 0, pulled: 0 });
    expect(await b.sync()).toMatchObject({ pushed: 0, pulled: 0 });
  });

  it('syncs the largest image that fits in a document', async () => {
    const a = device();
    const b = device();
    const bytes = Buffer.alloc(4 * 1024 * 1024, 9);
    const name = `${createHash('sha256').update(bytes).digest('hex')}.png`;
    mkdirSync(path.join(a.userData, 'images'));
    writeFileSync(path.join(a.userData, 'images', name), bytes);
    expect(await a.sync()).toMatchObject({ pushed: 1, skippedFiles: 0 });
    await b.sync();
    expect(readFileSync(path.join(b.userData, 'images', name))).toEqual(bytes);
  }, 30_000);

  it('skips images too large for a document', async () => {
    const a = device();
    const bytes = Buffer.alloc(4 * 1024 * 1024 + 1, 7);
    const name = `${createHash('sha256').update(bytes).digest('hex')}.png`;
    mkdirSync(path.join(a.userData, 'images'));
    writeFileSync(path.join(a.userData, 'images', name), bytes);
    const result = await a.sync();
    expect(result.skippedFiles).toBe(1);
    expect(result.pushed).toBe(0);
  });
});

describe('conflicts', () => {
  async function diverge() {
    const a = device();
    const b = device();
    const note = create(a, 'Base', 'Texto base');
    await a.sync();
    await b.sync();
    return { a, b, note };
  }
  const edit = (
    target: ReturnType<typeof device>,
    id: string,
    body: string,
    updatedAt: string,
  ) => {
    const current = target.notes.findById(id)!;
    target.notes.update({
      id,
      title: current.title,
      body,
      expectedRevision: current.revision,
    });
    target.database
      .prepare('UPDATE notes SET updated_at = ? WHERE id = ?')
      .run(updatedAt, id);
  };

  it('keeps both versions and lets the newest win', async () => {
    const { a, b, note } = await diverge();
    edit(a, note.id, 'Versión A', '2030-01-01T10:00:00.000Z');
    edit(b, note.id, 'Versión B', '2030-01-01T11:00:00.000Z');
    await a.sync();
    const result = await b.sync();
    expect(result.conflicts).toBe(1);
    await a.sync();
    await b.sync();
    for (const device of [a, b]) {
      const notes = device.list();
      expect(notes).toHaveLength(2);
      expect(device.notes.findById(note.id)?.body).toBe('Versión B');
      const copy = notes.find(({ id }) => id !== note.id);
      expect(copy).toMatchObject({
        title: 'Base (conflicto)',
        body: 'Versión A',
      });
      expect(copy?.metadata?.tags).toContain('conflicto');
    }
  });

  it('keeps the local version when it is newer', async () => {
    const { a, b, note } = await diverge();
    edit(a, note.id, 'Antigua', '2030-01-01T10:00:00.000Z');
    edit(b, note.id, 'Reciente', '2030-01-01T12:00:00.000Z');
    await b.sync();
    await a.sync();
    await b.sync();
    expect(a.notes.findById(note.id)?.body).toBe('Reciente');
    expect(a.list().some(({ body }) => body === 'Antigua')).toBe(true);
    expect(b.list().some(({ body }) => body === 'Antigua')).toBe(true);
  });

  it('does not duplicate identical edits', async () => {
    const { a, b, note } = await diverge();
    edit(a, note.id, 'Igual', '2030-01-01T10:00:00.000Z');
    edit(b, note.id, 'Igual', '2030-01-01T10:00:00.000Z');
    await a.sync();
    expect((await b.sync()).conflicts).toBe(0);
    expect(b.list()).toHaveLength(1);
  });

  it('keeps a note edited here but deleted elsewhere', async () => {
    const { a, b, note } = await diverge();
    a.notes.moveToTrash(note.id);
    a.notes.manageTrash({ action: 'delete', ids: [note.id] });
    await a.sync();
    const current = b.notes.findById(note.id)!;
    b.notes.update({
      id: note.id,
      title: 'Sigue viva',
      body: current.body,
      expectedRevision: current.revision,
    });
    await b.sync();
    await a.sync();
    expect(a.notes.findById(note.id)?.title).toBe('Sigue viva');
    expect(b.notes.findById(note.id)?.title).toBe('Sigue viva');
  });
});

describe('robustness', () => {
  it('announces applied notes in the shape the app accepts', async () => {
    const a = device();
    create(a, 'Aviso');
    await a.sync();
    const b = device();
    const applied: unknown[] = [];
    const store = new SqliteSyncStore(
      b.database,
      b.notes,
      b.library,
      b.userData,
      (note) => applied.push(note),
    );
    const { key } = await connectEncryption(b.client, 'frase de prueba', 1000);
    await runSync({ client: b.client, store, key, targetId: 'test' });
    expect(applied).toHaveLength(1);
    expect(noteSchema.safeParse(applied[0]).success).toBe(true);
  });

  it('rejects the wrong passphrase', async () => {
    const a = device();
    await a.sync();
    await expect(
      connectEncryption(a.client, 'otra frase', 1000),
    ).rejects.toMatchObject({
      code: 'wrong_passphrase',
    });
  });

  it('skips a document it cannot decrypt without stopping', async () => {
    const a = device();
    const b = device();
    create(a, 'Buena');
    await a.sync();
    await a.client.put('note:11111111-1111-4111-8111-111111111111', {
      docType: 'note',
      sealed: { v: 1, iv: 'AAAA', tag: 'AAAA', data: 'AAAA' },
    });
    const result = await b.sync();
    expect(result.unreadable).toBe(1);
    expect(b.list()).toHaveLength(1);
  });

  it('refuses to erase the server when most local notes vanish', async () => {
    const a = device();
    const b = device();
    const notes = Array.from({ length: 12 }, (_, index) =>
      create(a, `Nota ${index}`),
    );
    await a.sync();
    for (const { id } of notes) a.notes.moveToTrash(id);
    a.notes.manageTrash({ action: 'delete', ids: notes.map(({ id }) => id) });
    await expect(a.sync()).rejects.toMatchObject({ code: 'mass_delete' });
    await b.sync();
    expect(b.list()).toHaveLength(12);
  });

  it('resumes from its checkpoint', async () => {
    const a = device();
    const b = device();
    create(a, 'Primera');
    await a.sync();
    await b.sync();
    create(a, 'Segunda');
    await a.sync();
    expect((await b.sync()).pulled).toBe(1);
    expect(existsSync(b.userData)).toBe(true);
  });
});
