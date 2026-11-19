import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleApiRequest } from '../../../src/main/local-api/routes';
import { createBackend } from './support';

let context: ReturnType<typeof createBackend>;
beforeEach(() => {
  context = createBackend();
});
afterEach(() => context.close());

const call = (
  method: string,
  path: string,
  body?: unknown,
  query: Record<string, string> = {},
) =>
  handleApiRequest(
    { method, path, query: new URLSearchParams(query), body },
    context.backend,
  );
const create = async (body: Record<string, unknown> = {}) =>
  (await call('POST', '/notes', { title: 'Nota', body: 'Texto', ...body }))
    .body as { id: string; revision: number };

describe('notes', () => {
  it('creates a note and announces it to the app', async () => {
    const response = await call('POST', '/notes', {
      title: 'Hola',
      body: 'Mundo',
      tags: ['api'],
      status: 'active',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: 'Hola',
      body: 'Mundo',
      tags: ['api'],
      status: 'active',
      bookId: null,
      pinned: false,
      trashed: false,
      revision: 1,
    });
    expect(context.events.map(({ type }) => type)).toEqual(['created']);
  });

  it('reads a note by id', async () => {
    const { id } = await create({ title: 'Leer' });
    const response = await call('GET', `/notes/${id}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, title: 'Leer' });
  });

  it('answers 404 for an unknown note', async () => {
    const response = await call(
      'GET',
      '/notes/11111111-1111-4111-8111-111111111111',
    );
    expect(response.status).toBe(404);
  });

  it('answers 400 for a malformed id', async () => {
    expect((await call('GET', '/notes/nope')).status).toBe(400);
  });

  it('lists with limit and skip', async () => {
    await create({ title: 'A' });
    await create({ title: 'B' });
    await create({ title: 'C' });
    const page = await call('GET', '/notes', undefined, {
      limit: '2',
      skip: '1',
    });
    expect(page.status).toBe(200);
    expect(page.body).toHaveLength(2);
  });

  it('searches with the keyword', async () => {
    await create({ title: 'Receta de pan' });
    await create({ title: 'Otra cosa', body: 'nada' });
    const found = await call('GET', '/notes', undefined, { keyword: 'pan' });
    expect(found.body).toMatchObject([{ title: 'Receta de pan' }]);
  });

  it('filters by notebook, tag and status', async () => {
    const book = context.library.createNotebook({ name: 'Trabajo' });
    await create({ title: 'Dentro', bookId: book.id, tags: ['x'] });
    await create({ title: 'Fuera', status: 'completed' });
    expect(
      (await call('GET', '/notes', undefined, { bookId: book.id })).body,
    ).toMatchObject([{ title: 'Dentro' }]);
    expect(
      (await call('GET', '/notes', undefined, { tag: 'x' })).body,
    ).toMatchObject([{ title: 'Dentro' }]);
    expect(
      (await call('GET', '/notes', undefined, { status: 'completed' })).body,
    ).toMatchObject([{ title: 'Fuera' }]);
  });

  it('rejects an invalid limit', async () => {
    const response = await call('GET', '/notes', undefined, { limit: 'mucho' });
    expect(response.status).toBe(400);
  });

  it('rejects unknown fields and notebooks', async () => {
    expect((await call('POST', '/notes', { nope: 1 })).status).toBe(400);
    expect(
      (
        await call('POST', '/notes', {
          bookId: '11111111-1111-4111-8111-111111111111',
        })
      ).status,
    ).toBe(400);
  });

  it('updates only the sent fields', async () => {
    const { id } = await create({ title: 'Antes', tags: ['uno'] });
    const response = await call('PATCH', `/notes/${id}`, { title: 'Después' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      title: 'Después',
      body: 'Texto',
      tags: ['uno'],
      revision: 2,
    });
    expect(context.events.at(-1)?.type).toBe('updated');
  });

  it('pins a note', async () => {
    const { id } = await create();
    const response = await call('PATCH', `/notes/${id}`, { pinned: true });
    expect(response.body).toMatchObject({ pinned: true });
  });

  it('refuses an update based on an old revision', async () => {
    const { id } = await create();
    await call('PATCH', `/notes/${id}`, { title: 'Nuevo' });
    const response = await call('PATCH', `/notes/${id}`, {
      title: 'Viejo',
      revision: 1,
    });
    expect(response.status).toBe(409);
    expect((await call('GET', `/notes/${id}`)).body).toMatchObject({
      title: 'Nuevo',
    });
  });

  it('moves a note to the trash without destroying it', async () => {
    const { id } = await create();
    const response = await call('DELETE', `/notes/${id}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, trashed: true });
    expect((await call('GET', `/notes/${id}`)).body).toMatchObject({
      trashed: true,
    });
    expect((await call('GET', '/notes')).body).toEqual([]);
    expect(context.events.at(-1)?.type).toBe('trashed');
  });

  it('does not edit a note in the trash', async () => {
    const { id } = await create();
    await call('DELETE', `/notes/${id}`);
    expect((await call('PATCH', `/notes/${id}`, { title: 'X' })).status).toBe(
      409,
    );
  });
});

describe('library', () => {
  it('lists notebooks and tags', async () => {
    const book = context.library.createNotebook({ name: 'Trabajo' });
    await create({ bookId: book.id, tags: ['api'] });
    expect((await call('GET', '/books')).body).toMatchObject([
      { id: book.id, name: 'Trabajo', parentId: null, count: 1 },
    ]);
    expect((await call('GET', '/tags')).body).toMatchObject([
      { name: 'api', count: 1 },
    ]);
  });
});

describe('unknown routes', () => {
  it.each([
    ['GET', '/nope', 404],
    ['PUT', '/notes', 405],
    ['POST', '/books', 405],
    ['DELETE', '/notes', 405],
  ])('%s %s answers %i', async (method, path, status) => {
    expect((await call(method, path)).status).toBe(status);
  });
});
