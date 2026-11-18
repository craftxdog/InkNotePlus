import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteLibraryRepository } from '../../src/infrastructure/sqlite/sqlite-library-repository';
import { SqliteLibraryTransfer } from '../../src/infrastructure/sqlite/sqlite-library-transfer';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { readImportSources } from '../../src/main/note-import';

function png() {
  const chunk = (type: string, data: Buffer) => {
    const tag = Buffer.from(type);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tag, data])) >>> 0);
    return Buffer.concat([size, tag, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const image = png();
const managed = 'inknote-asset://images/stored.png';
let root: string;
const stored: Buffer[] = [];
const read = (paths: string[]) =>
  readImportSources(paths, {
    storeImage: async (bytes) => {
      stored.push(bytes);
      return managed;
    },
  });
const write = async (name: string, content: string | Buffer) => {
  const file = path.join(root, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
};
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'inknote-import-'));
  stored.length = 0;
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('Markdown files', () => {
  it('reads front matter, removes the repeated heading and keeps the dates', async () => {
    const file = await write(
      'nota.md',
      '---\ntitle: Desde YAML\ntags: [uno, dos]\ncreated: 2024-01-02T03:04:05Z\nupdated: 2024-02-03T04:05:06Z\n---\n\n# Desde YAML\n\nCuerpo\r\nfinal\n',
    );
    const { notes } = await read([file]);
    expect(notes[0]).toMatchObject({
      title: 'Desde YAML',
      body: 'Cuerpo\nfinal\n',
      tags: ['uno', 'dos'],
      folders: [],
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-02-03T04:05:06.000Z',
    });
  });
  it('uses the first heading, then the file name, as the title', async () => {
    const heading = await write('a.md', '# Título real\n\ntexto');
    const named = await write('Mi archivo.md', 'sólo texto');
    const { notes } = await read([heading, named]);
    expect(notes.map(({ title }) => title)).toEqual([
      'Título real',
      'Mi archivo',
    ]);
    expect(notes[0].body).toBe('texto');
  });
  it('stores relative images and leaves remote and code references alone', async () => {
    await write('img/foto uno.png', image);
    const file = await write(
      'n.md',
      '![Foto](img/foto%20uno.png "t") ![Web](https://example.com/a.png)\n\n`![x](img/foto%20uno.png)`\n',
    );
    const { notes, images } = await read([file]);
    expect(notes[0].body).toBe(
      `![Foto](${managed}) ![Web](https://example.com/a.png)\n\n\`![x](img/foto%20uno.png)\`\n`,
    );
    expect(images).toBe(1);
    expect(stored).toEqual([image]);
  });
  it('never reads images outside the imported folder', async () => {
    await write('secreto.png', image);
    await symlink(
      path.join(root, 'secreto.png'),
      path.join(root, 'enlace.png'),
    ).catch(() => {});
    const file = await write(
      'dentro/n.md',
      '![a](../secreto.png) ![b](/etc/passwd)',
    );
    const folder = await read([path.dirname(file)]);
    expect(stored).toHaveLength(0);
    expect(folder.missingImages).toBe(2);
    expect(folder.notes[0].body).toContain('../secreto.png');
  });
  it('counts images that cannot be stored', async () => {
    await write('roto.png', 'no es imagen');
    const file = await write('n.md', '![a](roto.png)');
    const result = await readImportSources([file], {
      storeImage: async () => null,
    });
    expect(result.missingImages).toBe(1);
  });
});

describe('folders', () => {
  it('turns subfolders into notebooks and ignores hidden and unrelated files', async () => {
    await write('Raiz/uno.md', 'a');
    await write('Raiz/Sub/dos.markdown', 'b');
    await write('Raiz/.oculto/tres.md', 'c');
    await write('Raiz/.DS_Store', 'x');
    await write('Raiz/datos.csv', '1,2');
    const { notes } = await read([path.join(root, 'Raiz')]);
    expect(notes.map(({ title, folders }) => [title, folders]).sort()).toEqual([
      ['dos', ['Raiz', 'Sub']],
      ['uno', ['Raiz']],
    ]);
  });
  it('removes the identifiers Notion adds to exported names', async () => {
    const hash = 'a'.repeat(32);
    await write(`Export/Proyecto ${hash}/Plan ${hash}.md`, 'texto');
    const { notes } = await read([path.join(root, 'Export')]);
    expect(notes[0]).toMatchObject({
      title: 'Plan',
      folders: ['Export', 'Proyecto'],
    });
  });
  it('reads Bear TextBundle packages with their assets', async () => {
    await write('Nota.textbundle/assets/a.png', image);
    await write('Nota.textbundle/text.md', '# Bear\n\n![](assets/a.png)\n');
    const { notes } = await read([path.join(root, 'Nota.textbundle')]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: 'Bear', folders: [] });
    expect(notes[0].body).toContain(managed);
  });
  it('skips unreadable files and keeps importing the rest', async () => {
    await write('C/bueno.md', 'a');
    await write('C/roto.enex', '<en-export><note>');
    const { notes, skipped } = await read([path.join(root, 'C')]);
    expect(notes).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});

describe('HTML files', () => {
  it('converts the page to Markdown without scripts', async () => {
    await write('a.png', image);
    const file = await write(
      'p.html',
      `<!doctype html><title>Página</title><script>alert(1)</script><h1>Página</h1>
       <p>Hola <strong>mundo</strong> <a href="https://example.com">enlace</a></p>
       <ul><li>uno</li></ul><img src="a.png" alt="Foto"><pre><code class="language-js">const a = 1;</code></pre>
       <table><tr><th>A</th></tr><tr><td>1</td></tr></table>`,
    );
    const { notes } = await read([file]);
    expect(notes[0].title).toBe('Página');
    const { body } = notes[0];
    expect(body).toContain('Hola **mundo** [enlace](https://example.com)');
    expect(body).toContain('- uno');
    expect(body).toContain(`![Foto](${managed})`);
    expect(body).toContain('```js\nconst a = 1;\n```');
    expect(body).toContain('| A |');
    expect(body).not.toContain('alert');
    expect(body).not.toMatch(/^# Página/m);
  });
  it('stores embedded base64 images', async () => {
    const file = await write(
      'd.html',
      `<img alt="x" src="data:image/png;base64,${image.toString('base64')}">`,
    );
    const { notes } = await read([file]);
    expect(notes[0].body).toContain(managed);
    expect(stored).toEqual([image]);
  });
});

describe('Evernote exports', () => {
  const hash = createHash('md5').update(image).digest('hex');
  const enex = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export><note><title>Reunión &amp; plan</title>
<created>20240102T030405Z</created><updated>20240203T040506Z</updated>
<tag>trabajo</tag><tag>ideas</tag>
<content><![CDATA[<?xml version="1.0"?><!DOCTYPE en-note SYSTEM "x"><en-note><div>Texto <b>fuerte</b></div><div><en-todo checked="true"/>Hecha</div><div><en-todo/>Pendiente</div><en-media hash="${hash}" type="image/png"/><en-media hash="ffff" type="application/pdf"/></en-note>]]></content>
<resource><data encoding="base64">${image.toString('base64')}</data><mime>image/png</mime></resource>
</note><note><title>Segunda</title><content><![CDATA[<en-note>Dos</en-note>]]></content></note></en-export>`;
  it('imports every note with tags, dates, tasks and images', async () => {
    const file = await write('Cuaderno.enex', enex);
    const { notes } = await read([file]);
    expect(notes.map(({ title }) => title)).toEqual([
      'Reunión & plan',
      'Segunda',
    ]);
    expect(notes[0]).toMatchObject({
      folders: ['Cuaderno'],
      tags: ['trabajo', 'ideas'],
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-02-03T04:05:06.000Z',
    });
    const { body } = notes[0];
    expect(body).toContain('Texto **fuerte**');
    expect(body).toContain('- [x] Hecha');
    expect(body).toContain('- [ ] Pendiente');
    expect(body).toContain(`](${managed})`);
    expect(stored).toEqual([image]);
  });
  it('reports attachments that are not images', async () => {
    const file = await write('Cuaderno.enex', enex);
    expect((await read([file])).missingImages).toBe(1);
  });
});

describe('Inkdrop backups', () => {
  const doc = (name: string, value: unknown) =>
    write(`Respaldo/data/${name}.json`, JSON.stringify(value));
  async function backup() {
    await write('Respaldo/state/x.json', '{}');
    await doc('book1', {
      _id: 'book:padre',
      name: 'Padre',
      parentBookId: null,
    });
    await doc('book2', {
      _id: 'book:hijo',
      name: 'Hijo',
      parentBookId: 'book:padre',
    });
    await doc('tag1', { _id: 'tag:t1', name: 'trabajo', color: 'red' });
    await doc('file1', {
      _id: 'file:f1',
      name: 'a.png',
      contentType: 'image/png',
      _attachments: { index: { data: image.toString('base64') } },
    });
    await doc('note1', {
      _id: 'note:n1',
      title: 'Primera',
      body: '![x](inkdrop://file:f1) [otra](inkdrop://note/n2)',
      bookId: 'book:hijo',
      tags: ['tag:t1', 'tag:perdida'],
      status: 'onHold',
      pinned: true,
      createdAt: 1704164645000,
      updatedAt: 1706933106000,
    });
    await doc('note2', {
      _id: 'note:n2',
      title: 'Segunda',
      body: 'b',
      bookId: 'book:padre',
    });
    await doc('note3', {
      _id: 'note:n3',
      title: 'Borrada',
      body: 'c',
      bookId: 'trash',
    });
    await doc('note4', {
      _id: 'note:n4',
      title: 'Plantilla',
      body: 'd',
      bookId: 'template',
    });
    return path.join(root, 'Respaldo');
  }
  it('restores the hierarchy, metadata, attachments and internal links', async () => {
    const { notes, images } = await read([await backup()]);
    expect(notes.map(({ title }) => title).sort()).toEqual([
      'Plantilla',
      'Primera',
      'Segunda',
    ]);
    const first = notes.find(({ title }) => title === 'Primera')!;
    const second = notes.find(({ title }) => title === 'Segunda')!;
    expect(first).toMatchObject({
      folders: ['Padre', 'Hijo'],
      tags: ['trabajo'],
      status: 'onhold',
      isPinned: true,
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-02-03T04:05:06.000Z',
    });
    expect(first.body).toBe(
      `![x](${managed}) [otra](inknote://note/${second.id})`,
    );
    expect(images).toBe(1);
    expect(notes.find(({ title }) => title === 'Plantilla')).toMatchObject({
      isTemplate: true,
      folders: [],
    });
  });
});

describe('saving imported notes', () => {
  const database = openDatabase(':memory:');
  const repository = new SqliteNoteRepository(database);
  const library = new SqliteLibraryRepository(database);
  const transfer = new SqliteLibraryTransfer(database, repository);
  afterAll(() => database.close());
  afterEach(() =>
    database.exec(
      'DELETE FROM note_revisions; DELETE FROM notes; DELETE FROM notebooks; DELETE FROM sync_outbox;',
    ),
  );
  const note = (title: string, folders: string[], extra = {}) => ({
    title,
    body: 'cuerpo',
    folders,
    tags: [],
    ...extra,
  });
  it('creates the notebook tree under the target and reuses existing siblings', () => {
    const target = library.createNotebook({ name: 'Destino' });
    const existing = library.createNotebook({
      name: 'Raiz',
      parentId: target.id,
    });
    expect(
      transfer.importNotes(
        [note('A', ['raiz']), note('B', ['raiz', 'Sub']), note('C', [])],
        target.id,
      ),
    ).toEqual({ notes: 3, notebooks: 1 });
    const books = library.getSnapshot().notebooks;
    const sub = books.find(({ name }) => name === 'Sub')!;
    expect(sub.parentId).toBe(existing.id);
    const byTitle = (title: string) =>
      repository.list({}).find((item) => item.title === title)!;
    expect(byTitle('A').metadata?.notebookId).toBe(existing.id);
    expect(byTitle('B').metadata?.notebookId).toBe(sub.id);
    expect(byTitle('C').metadata?.notebookId).toBe(target.id);
  });
  it('keeps original dates and sanitizes tags', () => {
    transfer.importNotes(
      [
        note('Fechas', [], {
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2021-01-01T00:00:00.000Z',
          tags: [
            ' uno ',
            'uno',
            '',
            'x'.repeat(80),
            ...Array.from({ length: 1200 }, (_, i) => `t${i}`),
          ],
        }),
      ],
      null,
    );
    const [saved] = repository.list({});
    expect(saved.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(saved.updatedAt).toBe('2021-01-01T00:00:00.000Z');
    expect(saved.metadata?.tags[0]).toBe('uno');
    expect(saved.metadata?.tags).toHaveLength(1000);
    expect(saved.metadata?.tags[1]).toHaveLength(64);
  });
  it('keeps the identity and state of imported Inkdrop notes', () => {
    const id = '5a5115f8-747f-416d-82d5-d9c12e34d323';
    transfer.importNotes(
      [
        note('Fija', [], {
          id,
          status: 'onhold',
          isPinned: true,
          isTemplate: true,
        }),
      ],
      null,
    );
    expect(repository.findById(id)).toMatchObject({
      isPinned: true,
      metadata: { status: 'onhold', isTemplate: true },
    });
  });
  it('saves nothing if the target notebook no longer exists', () => {
    expect(() =>
      transfer.importNotes(
        [note('A', ['X'])],
        '7a5115f8-747f-416d-82d5-d9c12e34d323',
      ),
    ).toThrow();
    expect(repository.list({})).toEqual([]);
    expect(library.getSnapshot().notebooks).toEqual([]);
  });
});
