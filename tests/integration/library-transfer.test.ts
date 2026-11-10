import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteLibraryTransfer } from '../../src/infrastructure/sqlite/sqlite-library-transfer';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { SqliteSyncOutbox } from '../../src/infrastructure/sqlite/sqlite-sync-outbox';
import { BackupFiles } from '../../src/main/backup-files';
import { BackupService } from '../../src/main/backup-service';
import { storeImage } from '../../src/main/image-store';
import {
  exportLibraryMarkdown,
  exportMarkdown,
} from '../../src/main/markdown-export';
import { renderNoteExport } from '../../src/main/render-note-export';
import { digest } from '../../src/main/transfer-files';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
  'base64',
);
let temporary: string;
let databases: ReturnType<typeof openDatabase>[];

beforeEach(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'inknote-transfer-'));
  databases = [];
});
afterEach(async () => {
  vi.useRealTimers();
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
  const books = new SqliteLibraryRepository(database);
  const library = new SqliteLibraryTransfer(database, notes);
  return {
    directory,
    notes,
    books,
    library,
    outbox,
    images: path.join(directory, 'images'),
    backup: new BackupFiles(library, directory, outbox.getDeviceId()),
  };
}

describe('local library backups', () => {
  it('preserves custom tag colors and reads backups created before tags had their own records', async () => {
    const source = await profile('source');
    const target = await profile('target');
    const legacy = await profile('legacy');
    const note = source.notes.create({
      title: 'Tagged',
      body: '',
      metadata: { ...defaultNoteMetadata, tags: ['Project'] },
    });
    source.books.updateTag({
      name: 'Project',
      nextName: 'Project',
      color: 'violet',
    });
    const { directory } = await source.backup.create(temporary);
    await target.backup.restore(await target.backup.read(directory));
    expect(target.books.getSnapshot().tags).toContainEqual({
      name: 'Project',
      count: 1,
      color: 'violet',
    });

    const file = path.join(directory, 'state', 'manifest.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    delete manifest.tags;
    await writeFile(file, JSON.stringify(manifest));
    await legacy.backup.restore(await legacy.backup.read(directory));
    expect(legacy.notes.findById(note.id)?.metadata?.tags).toEqual(['Project']);
    expect(legacy.books.getSnapshot().tags).toContainEqual({
      name: 'Project',
      count: 1,
    });
  });

  it('restores hierarchy, metadata, Trash and managed images into a clean profile', async () => {
    const source = await profile('source');
    const target = await profile('target');
    const parent = source.books.createNotebook({
      name: 'Work',
      icon: 'briefcase',
    });
    const book = source.books.createNotebook({
      name: 'Projects',
      parentId: parent.id,
      icon: 'rocket',
    });
    const image = await storeImage(png, source.directory, () => true);
    const body = `Roadmap ![Diagram](${image.url})`;
    const note = source.notes.create({ title: 'Milestone', body });
    const saved = source.notes.update({
      id: note.id,
      expectedRevision: note.revision,
      title: note.title,
      body,
      isPinned: true,
      metadata: {
        ...defaultNoteMetadata,
        notebookId: book.id,
        status: 'onhold',
        tags: ['release'],
        isTemplate: true,
      },
    });
    const trashed = source.notes.moveToTrash(
      source.notes.create({ title: 'Old', body: 'Keep in Trash' }).id,
    );
    const { directory } = await source.backup.create(temporary);
    const snapshot = await target.backup.read(directory);

    await expect(target.backup.restore(snapshot)).resolves.toEqual({
      notes: 2,
      notebooks: 2,
      copies: 0,
    });
    expect(target.notes.findById(saved.id)).toEqual(saved);
    expect(target.notes.list({ trashed: true })).toEqual([trashed]);
    expect(target.notes.search({ query: 'Roadmap' })).toEqual([saved]);
    expect(target.books.getSnapshot().notebooks).toContainEqual(
      expect.objectContaining({
        id: book.id,
        parentId: parent.id,
        icon: 'rocket',
      }),
    );
    expect(target.outbox.listPending()).toHaveLength(2);
    expect(
      await readFile(path.join(target.images, image.url.split('/').at(-1)!)),
    ).toEqual(png);
    expect(
      await readdir(path.join(directory, '_deleted', 'notes')),
    ).toHaveLength(1);
  });

  it('keeps local edits and imports each different backed-up note once', async () => {
    const source = await profile('source');
    const note = source.notes.create({
      title: 'Draft',
      body: 'Earlier version',
    });
    const { directory } = await source.backup.create(temporary);
    const changed = source.notes.update({
      ...note,
      expectedRevision: note.revision,
      body: 'Current version',
    });
    const snapshot = await source.backup.read(directory);

    await expect(source.backup.restore(snapshot)).resolves.toEqual({
      notes: 0,
      notebooks: 0,
      copies: 1,
    });
    await expect(source.backup.restore(snapshot)).resolves.toEqual({
      notes: 0,
      notebooks: 0,
      copies: 0,
    });
    expect(source.notes.findById(note.id)).toEqual(changed);
    expect(source.notes.list()).toContainEqual(
      expect.objectContaining({
        title: 'Draft (recuperada)',
        body: 'Earlier version',
      }),
    );
    expect(source.notes.list()).toHaveLength(2);
  });

  it('keeps the previous snapshot readable when a later write fails', async () => {
    const source = await profile('source');
    const note = source.notes.create({ title: 'Draft', body: 'Before' });
    const { directory } = await source.backup.create(temporary);
    const updated = source.notes.update({
      ...note,
      expectedRevision: note.revision,
      body: 'After',
    });
    source.books.createNotebook({ name: 'New notebook' });
    const blocked = path.join(
      directory,
      'data',
      'notebooks',
      `${digest(JSON.stringify(source.library.listNotebooks()))}.json`,
    );
    await mkdir(blocked);

    await expect(source.backup.update(directory)).rejects.toThrow();
    expect((await source.backup.read(directory)).notes).toEqual([note]);
    await rm(blocked, { recursive: true });
    await source.backup.update(directory);
    expect((await source.backup.read(directory)).notes).toEqual([updated]);
  });

  it('rejects a corrupt attachment before importing any SQLite records', async () => {
    const source = await profile('source');
    const target = await profile('target');
    const image = await storeImage(png, source.directory, () => true);
    source.notes.create({
      title: 'Attachment',
      body: `![Image](${image.url})`,
    });
    const { directory } = await source.backup.create(temporary);
    await writeFile(
      path.join(directory, 'data', 'images', image.url.split('/').at(-1)!),
      'corrupt',
    );

    await expect(
      target.backup.restore(await target.backup.read(directory)),
    ).rejects.toThrow();
    expect(target.notes.list()).toEqual([]);
    expect(target.outbox.listPending()).toEqual([]);
  });

  it('refuses profile paths, foreign backup owners and redirected backup folders', async () => {
    const source = await profile('source');
    const target = await profile('target');
    await expect(source.backup.create(source.directory)).rejects.toThrow();
    const { directory } = await source.backup.create(temporary);
    await expect(target.backup.update(directory)).rejects.toThrow();
    const notesFolder = path.join(directory, 'data', 'notes');
    await rm(notesFolder, { recursive: true });
    await symlink(target.directory, notesFolder, 'junction');
    source.notes.create({ title: 'Local', body: 'Keep inside backup' });
    await expect(source.backup.update(directory)).rejects.toThrow();
    expect(await readdir(target.directory)).toEqual([]);
  });

  it('automatically catches committed edits and stops after deactivation', async () => {
    const source = await profile('source');
    const saved = vi.fn();
    const service = new BackupService({
      files: source.backup,
      directory: null,
      saveDirectory: saved,
      onStatus: () => {},
    });
    vi.useFakeTimers();
    try {
      const { directory } = await service.enable(temporary);
      expect(saved).toHaveBeenLastCalledWith(directory);
      const note = source.notes.create({
        title: 'Saved after enable',
        body: 'Body',
      });
      service.schedule();
      await vi.advanceTimersByTimeAsync(1_000);
      await service.drain();
      expect((await source.backup.read(directory!)).notes).toEqual([note]);
      await service.disable();
      source.notes.create({ title: 'After disable', body: '' });
      service.schedule();
      await vi.advanceTimersByTimeAsync(1_000);
      await service.drain();
      expect(saved).toHaveBeenLastCalledWith(null);
      expect((await source.backup.read(directory!)).notes).toEqual([note]);
    } finally {
      service.dispose();
    }
  });
});

describe('portable editor exports', () => {
  it('exports the library and reports missing attachments while preserving their references', async () => {
    const source = await profile('source');
    const body = `A note with ![Image](inknote-asset://images/${'a'.repeat(64)}.png)`;
    const note = source.notes.create({ title: 'Missing image', body });
    const archive = await exportLibraryMarkdown(
      source.library,
      temporary,
      source.images,
    );
    expect(archive).toMatchObject({ notes: 1, missingAttachments: 1 });
    expect(
      await readFile(path.join(archive!.path, 'Missing image.md'), 'utf8'),
    ).toBe(body);
    const rendered = await renderNoteExport(
      note,
      { mathEnabled: true, mermaidEnabled: true },
      source.images,
    );
    expect(rendered.missingAttachments).toBe(1);
    expect(rendered.html).toContain('[Imagen: Image]');
  });

  it('rewrites real image references and leaves the same text in fenced code', async () => {
    const source = await profile('source');
    const image = await storeImage(png, source.directory, () => true);
    const literal = `![Example](${image.url})`;
    const note = source.notes.create({
      title: 'Portable',
      body: `![Embedded](<${image.url}> "caption")\n\n![Reference][image]\n\n[image]: ${image.url}\n\n\`\`\`md\n${literal}\n\`\`\`\n`,
    });
    const file = path.join(temporary, 'Portable note.md');
    await exportMarkdown(note, file, source.images);
    const name = image.url.split('/').at(-1)!;
    expect(await readFile(file, 'utf8')).toBe(
      `![Embedded](Portable%20note.assets/${name} "caption")\n\n![Reference][image]\n\n[image]: Portable%20note.assets/${name}\n\n\`\`\`md\n${literal}\n\`\`\`\n`,
    );
    expect(
      await readFile(path.join(temporary, 'Portable note.assets', name)),
    ).toEqual(png);
  });

  it('exports a notebook tree with portable names, collisions, and relative images', async () => {
    const source = await profile('source');
    const image = await storeImage(png, source.directory, () => true);
    const parent = source.books.createNotebook({ name: 'Work' });
    const book = source.books.createNotebook({
      name: 'Projects',
      parentId: parent.id,
    });
    const metadata = { ...defaultNoteMetadata, notebookId: book.id };
    source.notes.create({
      title: 'CON',
      body: `![Image](${image.url})`,
      metadata,
    });
    source.notes.create({ title: 'con', body: 'Another note', metadata });
    source.notes.moveToTrash(
      source.notes.create({ title: 'In Trash', body: '' }).id,
    );
    const result = await exportLibraryMarkdown(
      source.library,
      temporary,
      source.images,
    );

    expect(result?.notes).toBe(2);
    const directory = path.join(result!.path, 'Work', 'Projects');
    const files = await readdir(directory);
    expect(files.map((file) => file.toLowerCase()).sort()).toEqual([
      '_con (2).md',
      '_con.md',
    ]);
    const bodies = await Promise.all(
      files.map((file) => readFile(path.join(directory, file), 'utf8')),
    );
    const name = image.url.split('/').at(-1)!;
    expect(bodies).toContain(`![Image](../../Attachments/${name})`);
    expect(
      await readFile(path.join(result!.path, 'Attachments', name)),
    ).toEqual(png);
  });

  it('renders self-contained HTML for print with safe Markdown, math, diagrams and images', async () => {
    const source = await profile('source');
    const image = await storeImage(png, source.directory, () => true);
    const body = [
      '## Heading',
      '',
      '> [!NOTE]',
      '> Useful.',
      '',
      '- [x] Done',
      '',
      '| Name | Count |',
      '| --- | --- |',
      '| Notes | 2 |',
      '',
      'Inline $x^2$ and <mark>marked</mark>.',
      '',
      '~~~mermaid',
      'flowchart LR',
      '  A[Start] --> B[Done]',
      '~~~',
      '',
      `![Image width:50%](${image.url})`,
      '![Remote](https://example.com/remote.png)',
      '',
      '[Bad](javascript:alert%281%29)',
      '',
      '<script>alert(1)</script>',
    ].join('\n');
    const note = source.notes.create({ title: '<Export>', body });
    const { html } = await renderNoteExport(
      note,
      { mathEnabled: true, mermaidEnabled: true },
      source.images,
    );

    expect(html).toContain('<h1 class="note-title">&lt;Export&gt;</h1>');
    expect(html).toContain('<math');
    expect(html).toContain('<table>');
    expect(html).toContain('gfm-alert-type-note');
    expect(html).toContain('<mark>marked</mark>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).toContain('width:50%');
    expect(html).not.toMatch(/<script|javascript:|src="https:/);
  });
});
