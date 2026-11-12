import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMigrations,
  openDatabase,
} from '../../src/infrastructure/sqlite/database';
import { migrations } from '../../src/infrastructure/sqlite/migrations';
import { SqliteLibraryTransfer } from '../../src/infrastructure/sqlite/sqlite-library-transfer';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { SqliteSyncOutbox } from '../../src/infrastructure/sqlite/sqlite-sync-outbox';
import { BackupFiles } from '../../src/main/backup-files';

let temporary: string;
let databases: ReturnType<typeof openDatabase>[];

beforeEach(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'inknote-backup-qa-'));
  databases = [];
});

afterEach(async () => {
  for (const database of databases) database.close();
  await rm(temporary, { recursive: true, force: true });
});

async function profile(name: string) {
  const directory = path.join(temporary, name);
  await mkdir(directory);
  const database = openDatabase(':memory:');
  databases.push(database);
  const outbox = new SqliteSyncOutbox(database);
  const notes = new SqliteNoteRepository(database, outbox);
  const library = new SqliteLibraryTransfer(database, notes);
  return {
    directory,
    notes,
    outbox,
    backup: new BackupFiles(library, directory, outbox.getDeviceId()),
  };
}

describe('backup integrity and repeated recovery', () => {
  it('upgrades a version 5 database without altering notes, revisions or pending operations', () => {
    const database = new DatabaseSync(':memory:', {
      enableForeignKeyConstraints: true,
    });
    databases.push(database);
    database.exec(
      'CREATE TABLE inknote_schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT',
    );
    for (const migration of migrations.filter(({ version }) => version <= 5)) {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO inknote_schema_migrations VALUES (?, ?)')
        .run(migration.version, new Date().toISOString());
    }
    const outbox = new SqliteSyncOutbox(database);
    const notes = new SqliteNoteRepository(database, outbox);
    const note = notes.create({ title: 'Existing note', body: 'Kept text' });
    const pending = outbox.listPending();
    applyMigrations(database);
    applyMigrations(database);
    expect(notes.findById(note.id)).toEqual(note);
    expect(outbox.listPending()).toEqual(pending);
    expect(new SqliteLibraryTransfer(database, notes).listRecoveries()).toEqual(
      [],
    );
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('preserves the previous checked snapshot if verification fails after rewriting a note', async () => {
    const source = await profile('source');
    const note = source.notes.create({ title: 'Draft', body: 'Saved text' });
    const { directory } = await source.backup.create(temporary);
    const manifestPath = path.join(directory, 'state', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const notesDirectory = path.join(directory, 'data', 'notes');
    const filename = (await readdir(notesDirectory)).find((name) =>
      name.startsWith(`${note.id}.`),
    )!;
    const notePath = path.join(notesDirectory, filename);
    const formatted = JSON.stringify(
      JSON.parse(await readFile(notePath, 'utf8')),
      null,
      2,
    );
    const hash = createHash('sha256').update(formatted).digest('hex');
    const checkedPath = path.join(
      notesDirectory,
      filename.replace(manifest.notes[0].sha256, hash),
    );
    if (checkedPath !== notePath) await rename(notePath, checkedPath);
    await writeFile(checkedPath, formatted);
    manifest.notes[0].sha256 = hash;
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(source.backup.read(directory)).resolves.toMatchObject({
      notes: [note],
    });

    const images = path.join(source.directory, 'images');
    await mkdir(images);
    await writeFile(
      path.join(images, `${'a'.repeat(64)}.png`),
      'invalid image',
    );
    await expect(source.backup.update(directory, true)).rejects.toThrow();
    await expect(source.backup.read(directory)).resolves.toMatchObject({
      notes: [note],
    });
  });

  it('does not duplicate an existing recovery when an earlier recovery slot was deleted', async () => {
    const source = await profile('source');
    const original = source.notes.create({
      title: 'Draft',
      body: 'Backup text',
    });
    const { directory } = await source.backup.create(temporary);
    source.notes.update({
      ...original,
      expectedRevision: original.revision,
      body: 'Current text',
    });
    const snapshot = await source.backup.read(directory);
    expect((await source.backup.restore(snapshot)).copies).toBe(1);
    const first = source.notes.list().find((note) => note.id !== original.id)!;
    source.notes.update({
      ...first,
      expectedRevision: first.revision,
      body: 'Edited copy',
    });
    expect((await source.backup.restore(snapshot)).copies).toBe(1);
    source.notes.moveToTrash(first.id);
    source.notes.manageTrash({ action: 'delete', ids: [first.id] });

    expect((await source.backup.restore(snapshot)).copies).toBe(0);
    expect(
      source.notes.list().filter((note) => note.body === 'Backup text'),
    ).toHaveLength(1);
  });

  it('retains recovery identity through a new backup restored into another profile', async () => {
    const source = await profile('source');
    const target = await profile('target');
    const original = source.notes.create({
      title: 'Draft',
      body: 'Backup text',
    });
    const backup = await source.backup.create(temporary);
    const old = await source.backup.read(backup.directory);
    source.notes.update({
      ...original,
      expectedRevision: original.revision,
      body: 'Current text',
    });
    await source.backup.restore(old);
    const first = source.notes.list().find((note) => note.id !== original.id)!;
    source.notes.update({
      ...first,
      expectedRevision: first.revision,
      body: 'Edited recovery',
    });
    await source.backup.restore(old);
    source.notes.moveToTrash(first.id);
    source.notes.manageTrash({ action: 'delete', ids: [first.id] });
    const current = await source.backup.create(temporary);
    await target.backup.restore(await target.backup.read(current.directory));

    expect((await target.backup.restore(old)).copies).toBe(0);
    expect(target.notes.list()).toHaveLength(2);
  });

  it('keeps recoveries from different source notes separate even when their text is identical', async () => {
    const source = await profile('source');
    const originals = Array.from({ length: 2 }, () =>
      source.notes.create({ title: 'Same title', body: 'Same body' }),
    );
    const { directory } = await source.backup.create(temporary);
    for (const original of originals)
      source.notes.update({
        ...original,
        expectedRevision: original.revision,
        body: 'Edited body',
      });
    const snapshot = await source.backup.read(directory);
    expect((await source.backup.restore(snapshot)).copies).toBe(2);
    expect((await source.backup.restore(snapshot)).copies).toBe(0);
    expect(
      source.notes.list().filter((note) => note.body === 'Same body'),
    ).toHaveLength(2);
  });

  it('reads legacy backups and atomically adds checksums on their next update', async () => {
    const source = await profile('source');
    const target = await profile('target');
    const note = source.notes.create({ title: 'Legacy', body: 'Kept text' });
    const { directory } = await source.backup.create(temporary);
    const file = path.join(directory, 'state', 'manifest.json');
    const legacy = JSON.parse(await readFile(file, 'utf8'));
    legacy.version = 1;
    delete legacy.recoveries;
    for (const version of legacy.notes) {
      const notesDirectory = path.join(directory, 'data', 'notes');
      const checkedName = (await readdir(notesDirectory)).find((name) =>
        name.startsWith(version.id),
      )!;
      await rename(
        path.join(notesDirectory, checkedName),
        path.join(notesDirectory, `${version.id}.${version.revision}.json`),
      );
      delete version.sha256;
    }
    await writeFile(file, JSON.stringify(legacy));

    await target.backup.restore(await target.backup.read(directory));
    expect(target.notes.findById(note.id)).toEqual(note);
    await source.backup.update(directory);
    const upgraded = JSON.parse(await readFile(file, 'utf8'));
    expect(upgraded.version).toBe(2);
    expect(upgraded.notes[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(source.backup.read(directory)).resolves.toMatchObject({
      notes: [note],
    });
  });

  it('refuses a new-format manifest with a missing note checksum', async () => {
    const source = await profile('source');
    source.notes.create({ title: 'Checked', body: 'Kept text' });
    const { directory } = await source.backup.create(temporary);
    const file = path.join(directory, 'state', 'manifest.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    delete manifest.notes[0].sha256;
    await writeFile(file, JSON.stringify(manifest));
    await expect(source.backup.read(directory)).rejects.toThrow();
  });

  it.each(['title', 'body'] as const)(
    'rejects a valid note JSON whose %s was altered before importing',
    async (field) => {
      const source = await profile('source');
      const target = await profile('target');
      const note = source.notes.create({
        title: 'Original',
        body: 'Backup text',
      });
      const { directory } = await source.backup.create(temporary);
      const file = path.join(
        directory,
        'data',
        'notes',
        (await readdir(path.join(directory, 'data', 'notes'))).find((name) =>
          name.startsWith(note.id),
        )!,
      );
      const json = JSON.parse(await readFile(file, 'utf8'));
      json[field] = 'Altered';
      await writeFile(file, JSON.stringify(json));

      await expect(target.backup.read(directory)).rejects.toThrow();
      expect(target.notes.list()).toEqual([]);
      expect(target.outbox.listPending()).toEqual([]);
    },
  );

  it('recovers the backup again after the first recovered copy is edited, without later duplicates', async () => {
    const source = await profile('source');
    const original = source.notes.create({
      title: 'Draft',
      body: 'Backup text',
    });
    const { directory } = await source.backup.create(temporary);
    const current = source.notes.update({
      ...original,
      expectedRevision: original.revision,
      body: 'Current text',
    });
    const snapshot = await source.backup.read(directory);
    expect((await source.backup.restore(snapshot)).copies).toBe(1);
    const recovered = source.notes
      .list()
      .find((note) => note.id !== original.id)!;
    const edited = source.notes.update({
      ...recovered,
      expectedRevision: recovered.revision,
      body: 'Edited recovered text',
    });

    expect((await source.backup.restore(snapshot)).copies).toBe(1);
    expect(source.notes.findById(current.id)).toEqual(current);
    expect(source.notes.findById(edited.id)).toEqual(edited);
    expect(
      source.notes.list().filter((note) => note.body === 'Backup text'),
    ).toHaveLength(1);
    expect((await source.backup.restore(snapshot)).copies).toBe(0);
    expect(source.notes.list()).toHaveLength(3);
  });
});
