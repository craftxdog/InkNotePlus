import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleApiRequest } from '../../../src/main/local-api/routes';
import { handleMcpMessage } from '../../../src/main/local-api/mcp';
import { scopeNotesBackend } from '../../../src/main/local-api/notes-scope';
import type { LocalApiScope } from '../../../src/shared/preferences';
import { defaultNoteMetadata } from '../../../src/shared/note-metadata';
import { createBackend } from './support';

let context: ReturnType<typeof createBackend>;
let scope: LocalApiScope = { type: 'all' };
let ids: Record<string, string> = {};
const books: Record<string, string> = {};

beforeEach(async () => {
  context = createBackend();
  scope = { type: 'all' };
  const notebook = (name: string, parentId: string | null = null) =>
    context.library.createNotebook({ name, parentId }).id;
  books.work = notebook('Trabajo');
  books.sub = notebook('Clientes', books.work);
  books.home = notebook('Personal');
  const note = async (
    key: string,
    notebookId: string | null,
    tags: string[] = [],
  ) => {
    const created = await context.backend.create({
      title: `Nota ${key}`,
      body: `Texto de la nota ${key}`,
      metadata: { ...defaultNoteMetadata, notebookId, tags },
    });
    if (!created.ok) throw new Error(created.error.code);
    ids[key] = created.data.id;
  };
  ids = {};
  await note('work', books.work, ['factura']);
  await note('sub', books.sub);
  await note('home', books.home, ['privado']);
  await note('loose', null, ['claude']);
  await note('shared', books.home, ['claude']);
});
afterEach(() => context.close());

const backend = () => scopeNotesBackend(context.backend, () => scope);
const api = (method: string, path: string, body?: unknown, query = '') =>
  handleApiRequest(
    { method, path, query: new URLSearchParams(query), body },
    backend(),
  );
const titles = (body: unknown) =>
  (body as { title: string }[]).map((note) => note.title).sort();
const tool = async (name: string, args: unknown = {}) => {
  const response = (await handleMcpMessage(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    },
    backend(),
    '1',
  )) as { result: { content: { text: string }[]; isError?: boolean } };
  return {
    isError: response.result.isError ?? false,
    data: JSON.parse(response.result.content[0].text),
  };
};

describe('local API scope', () => {
  it('shows every note when the scope is the whole library', async () => {
    expect((await api('GET', '/notes')).body).toHaveLength(5);
  });

  describe('limited to a notebook and its sub-notebooks', () => {
    beforeEach(() => {
      scope = { type: 'notebook', notebookId: books.work };
    });

    it('lists, searches and reads only notes inside the notebook', async () => {
      expect(titles((await api('GET', '/notes')).body)).toEqual([
        'Nota sub',
        'Nota work',
      ]);
      expect(
        titles((await api('GET', '/notes', undefined, 'keyword=nota')).body),
      ).toEqual(['Nota sub', 'Nota work']);
      expect(
        (await api('GET', '/notes', undefined, `bookId=${books.home}`)).body,
      ).toEqual([]);
      expect((await api('GET', `/notes/${ids.home}`)).status).toBe(404);
      expect((await api('GET', `/notes/${ids.sub}`)).status).toBe(200);
    });

    it('hides other notebooks and their tags', async () => {
      const listed = (await api('GET', '/books')).body as { id: string }[];
      expect(listed.map((book) => book.id).sort()).toEqual(
        [books.work, books.sub].sort(),
      );
      const tags = (await api('GET', '/tags')).body as { name: string }[];
      expect(tags.map((tag) => tag.name)).toEqual(['factura']);
    });

    it('refuses to edit, trash or move notes outside, or move notes out', async () => {
      expect(
        (await api('PATCH', `/notes/${ids.home}`, { body: 'x' })).status,
      ).toBe(404);
      expect((await api('DELETE', `/notes/${ids.home}`)).status).toBe(404);
      expect(
        (await api('PATCH', `/notes/${ids.work}`, { bookId: books.home }))
          .status,
      ).toBe(400);
      expect(
        (await api('PATCH', `/notes/${ids.work}`, { bookId: null })).status,
      ).toBe(400);
      expect(
        (await api('PATCH', `/notes/${ids.work}`, { bookId: books.sub }))
          .status,
      ).toBe(200);
    });

    it('creates notes inside the notebook', async () => {
      const created = await api('POST', '/notes', { title: 'Nueva' });
      expect(created.status).toBe(201);
      expect((created.body as { bookId: string }).bookId).toBe(books.work);
      expect(
        (await api('POST', '/notes', { title: 'Fuera', bookId: books.home }))
          .status,
      ).toBe(400);
    });

    it('applies to MCP tools as well', async () => {
      const found = await tool('search_notes', { query: 'nota' });
      expect(
        found.data.map((note: { title: string }) => note.title).sort(),
      ).toEqual(['Nota sub', 'Nota work']);
      expect((await tool('read_note', { id: ids.home })).isError).toBe(true);
      const notebooks = await tool('list_notebooks');
      expect(notebooks.data).toHaveLength(2);
    });

    it('shows nothing if the notebook no longer exists', async () => {
      scope = { type: 'notebook', notebookId: crypto.randomUUID() };
      expect((await api('GET', '/notes')).body).toEqual([]);
      expect((await api('GET', '/books')).body).toEqual([]);
      expect((await api('POST', '/notes', { title: 'x' })).status).toBe(400);
    });
  });

  describe('limited to a tag', () => {
    beforeEach(() => {
      scope = { type: 'tag', tag: 'claude' };
    });

    it('lists and reads only notes with the tag', async () => {
      expect(titles((await api('GET', '/notes')).body)).toEqual([
        'Nota loose',
        'Nota shared',
      ]);
      expect(
        titles(
          (await api('GET', '/notes', undefined, 'keyword=nota&tag=privado'))
            .body,
        ),
      ).toEqual([]);
      expect((await api('GET', `/notes/${ids.work}`)).status).toBe(404);
      const tags = (await api('GET', '/tags')).body as { name: string }[];
      expect(tags.map((tag) => tag.name)).toEqual(['claude']);
      const listed = (await api('GET', '/books')).body as {
        id: string;
        count: number;
      }[];
      // Personal holds two notes, but only one has the tag.
      expect(listed).toEqual([
        expect.objectContaining({ id: books.home, count: 1 }),
      ]);
    });

    it('tags new notes and refuses to remove the tag', async () => {
      const created = await api('POST', '/notes', {
        title: 'Nueva',
        tags: ['x'],
      });
      expect((created.body as { tags: string[] }).tags.sort()).toEqual([
        'claude',
        'x',
      ]);
      expect(
        (await api('PATCH', `/notes/${ids.loose}`, { tags: ['otra'] })).status,
      ).toBe(400);
      expect(
        (await api('PATCH', `/notes/${ids.loose}`, { body: 'Editada' })).status,
      ).toBe(200);
    });
  });
});
