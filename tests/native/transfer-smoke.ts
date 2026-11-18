import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, nativeImage } from 'electron';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteLibraryTransfer } from '../../src/infrastructure/sqlite/sqlite-library-transfer';
import { SqliteSyncOutbox } from '../../src/infrastructure/sqlite/sqlite-sync-outbox';
import { BackupFiles } from '../../src/main/backup-files';
import {
  exportCollection,
  exportMarkdown,
} from '../../src/main/markdown-export';
import { renderNoteExport } from '../../src/main/render-note-export';
import { printNote } from '../../src/main/print-note';
import { storeImage } from '../../src/main/image-store';
import { readImportSources } from '../../src/main/note-import';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';

const output = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.join(output, 'source');
await mkdir(sourceDirectory);
app.setPath('userData', sourceDirectory);
app.enableSandbox();
void app.whenReady().then(async () => {
  const databases: ReturnType<typeof openDatabase>[] = [];
  let parent: BrowserWindow | undefined;
  let exitCode = 0;
  function profile(directory: string) {
    const db = openDatabase(path.join(directory, 'notes.sqlite'));
    databases.push(db);
    const outbox = new SqliteSyncOutbox(db);
    const notes = new SqliteNoteRepository(db, outbox);
    const library = new SqliteLibraryTransfer(db, notes);
    return {
      db,
      notes,
      books: new SqliteLibraryRepository(db),
      backup: new BackupFiles(library, directory, outbox.getDeviceId()),
    };
  }
  try {
    const source = profile(sourceDirectory);
    const book = source.books.createNotebook({ name: 'Native QA' });
    const image = await storeImage(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
        'base64',
      ),
      sourceDirectory,
      () => true,
    );
    const codeFence =
      '```python filename="src/greet.py" line=18 title="Native code export"\ndef greet(name):\n    return "Hello " + name\n```';
    const note = source.notes.create({
      title: 'QA español 日本語 <export>',
      body: `## Native export\n\nInline $x^2$ and **bold**.\n\n> [!NOTE]\n> Export alert.\n\n- [x] Finished\n\n| Name | Count |\n| --- | --- |\n| Notes | 2 |\n\n~~~mermaid\nflowchart LR\n  A[Start] --> B[Done]\n~~~\n\n${codeFence}\n\n![Managed image](${image.url})\n\n<script>throw new Error('must not execute')</script>`,
      metadata: {
        ...defaultNoteMetadata,
        notebookId: book.id,
        tags: ['native-qa'],
      },
    });
    source.books.updateTag({
      name: 'native-qa',
      nextName: 'native-qa',
      color: 'violet',
    });
    const trashed = source.notes.moveToTrash(
      source.notes.create({ title: 'Recoverable', body: 'Kept in Trash' }).id,
    );
    const backupParent = path.join(output, 'backups');
    await mkdir(backupParent);
    const backup = await source.backup.create(backupParent);
    const targetDirectory = path.join(output, 'restored');
    await mkdir(targetDirectory);
    const target = profile(targetDirectory);
    const restored = await target.backup.restore(
      await target.backup.read(backup.directory),
    );
    assert.equal(restored.notes, 2);
    assert.deepEqual(target.notes.findById(note.id), note);
    assert.equal(
      target.notes.findById(trashed.id)?.deletedAt,
      trashed.deletedAt,
    );
    assert.equal(
      target.books.getSnapshot().tags.find((tag) => tag.name === 'native-qa')
        ?.color,
      'violet',
    );

    const markdown = path.join(output, 'native-export.md');
    assert.equal(
      await exportMarkdown(
        note,
        markdown,
        path.join(sourceDirectory, 'images'),
      ),
      0,
    );
    assert(!(await readFile(markdown, 'utf8')).includes('inknote-asset:'));
    const exported = await renderNoteExport(
      note,
      { mathEnabled: true, mermaidEnabled: true },
      path.join(sourceDirectory, 'images'),
    );
    assert.equal(exported.missingAttachments, 0);
    assert.match(exported.html, /<math/);
    assert.match(exported.html, /data:image\/svg\+xml;base64,/);
    assert.match(exported.html, /class="codeblock-title">Native code export/);
    assert.match(exported.html, /tok-definition-keyword/);
    assert.match(exported.html, /aria-hidden="true">18\n19<\/span>/);
    assert(!exported.html.includes('<script>'));
    const html = path.join(output, 'native-export.html');
    await writeFile(html, exported.html);
    parent = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const pdf = path.join(output, 'native-export.pdf');
    assert.equal(await printNote(exported.html, parent, pdf), true);
    const bytes = await readFile(pdf);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert(bytes.length > 1000);
    const pages = [...bytes.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)]
      .length;
    assert(pages >= 1);
    const collection = await exportCollection(
      new SqliteLibraryTransfer(source.db, source.notes),
      output,
      path.join(sourceDirectory, 'images'),
      {
        format: 'html',
        scope: { kind: 'notes', ids: [note.id] },
        renderHtml: (item) =>
          renderNoteExport(
            item,
            { mathEnabled: true, mermaidEnabled: true },
            path.join(sourceDirectory, 'images'),
          ),
      },
    );
    assert.equal(collection?.notes, 1);
    // The import parsers must load and decode real images inside Electron.
    const imports = path.join(output, 'import-source', 'Proyecto', 'Sub');
    await mkdir(imports, { recursive: true });
    const picture = nativeImage
      .createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      )
      .toPNG();
    await writeFile(path.join(imports, 'foto.png'), picture);
    await writeFile(
      path.join(imports, 'nota.md'),
      '# Importada\n\n![Foto](foto.png)\n',
    );
    await writeFile(
      path.join(imports, 'pagina.html'),
      '<title>Página</title><p>Hola <b>HTML</b></p>',
    );
    await writeFile(
      path.join(imports, 'libreta.enex'),
      '<en-export><note><title>Evernote</title><content><![CDATA[<en-note><en-todo checked="true"/>Hecha</en-note>]]></content></note></en-export>',
    );
    const importDirectory = path.join(output, 'import-target');
    await mkdir(importDirectory);
    const importTarget = profile(importDirectory);
    const importSource = await readImportSources(
      [path.join(output, 'import-source', 'Proyecto')],
      {
        storeImage: async (bytes) =>
          (
            await storeImage(
              bytes,
              importDirectory,
              (value) => !nativeImage.createFromBuffer(value).isEmpty(),
            )
          ).url,
      },
    );
    assert.equal(importSource.skipped, 0);
    assert.equal(importSource.images, 1);
    assert.deepEqual(
      new SqliteLibraryTransfer(
        importTarget.db,
        importTarget.notes,
      ).importNotes(importSource.notes, null),
      { notes: 3, notebooks: 3 },
    );
    const imported = importTarget.notes.list({ sort: 'title-asc' });
    assert.deepEqual(
      imported.map(({ title }) => title),
      ['Evernote', 'Importada', 'Página'],
    );
    assert.match(imported[0].body, /- \[x\] Hecha/);
    assert.match(imported[1].body, /!\[Foto\]\(inknote-asset:\/\/images\//);
    assert.match(imported[2].body, /Hola \*\*HTML\*\*/);
    for (const db of databases) {
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      assert.equal(
        db.prepare('PRAGMA integrity_check').get()?.integrity_check,
        'ok',
      );
    }
    const report = {
      electron: process.versions.electron,
      restored,
      sqlite: 'ok',
      markdown,
      html,
      pdf,
      pdfBytes: bytes.length,
      pages,
    };
    await writeFile(
      path.join(output, 'result.json'),
      JSON.stringify(report, null, 2),
    );
    console.log('Native transfer QA passed:', JSON.stringify(report));
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    parent?.destroy();
    for (const db of databases) db.close();
    app.exit(exitCode);
  }
});
