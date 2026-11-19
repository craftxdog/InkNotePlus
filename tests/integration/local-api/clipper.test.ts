import { request } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalApiServer } from '../../../src/main/local-api/http-server';
import { readClippedPage } from '../../../src/main/note-import';
import { createBackend } from './support';

const password = 'clave';
const authorization = `Basic ${Buffer.from(`inknote:${password}`).toString('base64')}`;
const extension = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
let context: ReturnType<typeof createBackend>;
let server: ReturnType<typeof createLocalApiServer>;
let port: number;
let allowed: string[];

beforeEach(async () => {
  context = createBackend();
  allowed = [extension];
  server = createLocalApiServer({
    backend: context.backend,
    username: 'inknote',
    password,
    version: '1',
    allowedOrigins: () => allowed,
    clip: (page) => readClippedPage(page, { storeImage: async () => null }),
  });
  port = await server.listen(0);
});
afterEach(async () => {
  await server.close();
  context.close();
});

function send(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  return new Promise<{
    status: number;
    text: string;
    headers: Record<string, unknown>;
  }>((resolve, reject) => {
    const client = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            text,
            headers: response.headers,
          }),
        );
      },
    );
    client.on('error', reject);
    client.end(options.body);
  });
}
const clip = (body: unknown, origin = extension) =>
  send('/clip', {
    method: 'POST',
    headers: { authorization, origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const page = {
  url: 'https://example.com/articulo',
  title: 'Un artículo',
  html: '<h1>Un artículo</h1><p>Texto <b>importante</b>.</p><script>alert(1)</script><img src="https://example.com/a.png" alt="Gráfico">',
};

describe('extension access', () => {
  it('accepts an allowed extension and returns CORS headers for it', async () => {
    const response = await send('/', {
      headers: { authorization, origin: extension },
    });
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(extension);
  });

  it('answers the preflight of an allowed extension without credentials', async () => {
    const response = await send('/clip', {
      method: 'OPTIONS',
      headers: { origin: extension, 'access-control-request-method': 'POST' },
    });
    expect(response.status).toBe(204);
    expect(String(response.headers['access-control-allow-headers'])).toContain(
      'authorization',
    );
  });

  it('still requires the password from an allowed extension', async () => {
    expect((await send('/', { headers: { origin: extension } })).status).toBe(
      401,
    );
  });

  it.each([
    'https://example.com',
    'chrome-extension://otraextensionotraextensionotra00',
    'null',
  ])('rejects %s', async (origin) => {
    const response = await send('/', { headers: { authorization, origin } });
    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('stops accepting an extension as soon as it is removed', async () => {
    allowed = [];
    expect(
      (await send('/', { headers: { authorization, origin: extension } }))
        .status,
    ).toBe(403);
  });
});

describe('clipping', () => {
  it('saves a page as a Markdown note with its source', async () => {
    const response = await clip({ ...page, tags: ['web'] });
    expect(response.status).toBe(201);
    const note = JSON.parse(response.text);
    expect(note.title).toBe('Un artículo');
    expect(note.tags).toEqual(['web']);
    expect(note.body).toContain('Texto **importante**.');
    expect(note.body).toContain('![Gráfico](https://example.com/a.png)');
    expect(note.body).toContain('[example.com](https://example.com/articulo)');
    expect(note.body).not.toContain('alert');
    expect(context.events.at(-1)?.type).toBe('created');
  });

  it('names an untitled page after its site', async () => {
    const note = JSON.parse(
      (await clip({ ...page, title: '', html: '<p>Hola</p>' })).text,
    );
    expect(note.title).toBe('example.com');
  });

  it.each([
    ['a non-web address', { ...page, url: 'file:///etc/passwd' }],
    ['a missing page', { url: page.url, title: 't' }],
    ['unknown fields', { ...page, run: 'x' }],
  ])('rejects %s', async (_label, body) => {
    expect((await clip(body)).status).toBe(400);
  });

  it('also works from tools without an origin', async () => {
    const response = await send('/clip', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(page),
    });
    expect(response.status).toBe(201);
  });
});
