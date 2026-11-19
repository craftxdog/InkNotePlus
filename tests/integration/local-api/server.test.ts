import { request } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalApiServer } from '../../../src/main/local-api/http-server';
import { createBackend } from './support';

const password = 'secreto-de-prueba';
const authorization = `Basic ${Buffer.from(`inknote:${password}`).toString('base64')}`;
let context: ReturnType<typeof createBackend>;
let server: ReturnType<typeof createLocalApiServer>;
let port: number;

beforeEach(async () => {
  context = createBackend();
  server = createLocalApiServer({
    backend: context.backend,
    username: 'inknote',
    password,
    version: '9.9.9',
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
        headers: { authorization, ...options.headers },
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
const json = { 'content-type': 'application/json' };

describe('local API security', () => {
  it('only listens on the loopback interface', () => {
    expect(server.address()).toMatchObject({ address: '127.0.0.1' });
  });

  it('requires credentials', async () => {
    const response = await send('/notes', { headers: { authorization: '' } });
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic');
  });

  it('rejects a wrong password', async () => {
    const wrong = `Basic ${Buffer.from('inknote:otra').toString('base64')}`;
    const response = await send('/notes', {
      headers: { authorization: wrong },
    });
    expect(response.status).toBe(401);
  });

  it('slows down repeated failed logins', async () => {
    const wrong = `Basic ${Buffer.from('inknote:otra').toString('base64')}`;
    let last = 0;
    for (let index = 0; index < 25; index++)
      last = (await send('/', { headers: { authorization: wrong } })).status;
    expect(last).toBe(429);
    expect((await send('/')).status).toBe(429);
  });

  it('rejects requests from web pages', async () => {
    const response = await send('/notes', {
      headers: { origin: 'https://example.com' },
    });
    expect(response.status).toBe(403);
  });

  it('rejects a foreign Host header against DNS rebinding', async () => {
    const response = await send('/notes', {
      headers: { host: `evil.example:${port}` },
    });
    expect(response.status).toBe(403);
  });

  it('accepts localhost as the host', async () => {
    const response = await send('/', {
      headers: { host: `localhost:${port}` },
    });
    expect(response.status).toBe(200);
  });

  it('requires JSON for writes', async () => {
    const response = await send('/notes', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"title":"x"}',
    });
    expect(response.status).toBe(415);
  });

  it('rejects malformed JSON', async () => {
    const response = await send('/notes', {
      method: 'POST',
      headers: json,
      body: '{mal',
    });
    expect(response.status).toBe(400);
  });

  it('rejects an oversized body', async () => {
    const response = await send('/notes', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ body: 'x'.repeat(3 * 1024 * 1024) }),
    });
    expect(response.status).toBe(413);
  });

  it('never allows cross-origin reads or caching', async () => {
    const response = await send('/');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('local API requests', () => {
  it('reports the app version', async () => {
    const response = await send('/');
    expect(JSON.parse(response.text)).toEqual({
      name: 'InkNote',
      version: '9.9.9',
    });
  });

  it('creates and reads a note over HTTP', async () => {
    const created = await send('/notes', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ title: 'HTTP', body: 'Cuerpo' }),
    });
    expect(created.status).toBe(201);
    const { id } = JSON.parse(created.text);
    const read = await send(`/notes/${id}`);
    expect(JSON.parse(read.text)).toMatchObject({ title: 'HTTP' });
  });

  it('frees the port when closed', async () => {
    await server.close();
    await expect(send('/')).rejects.toThrow();
    port = await server.listen(0);
    expect((await send('/')).status).toBe(200);
  });

  it('reports a port already in use', async () => {
    const other = createLocalApiServer({
      backend: context.backend,
      username: 'inknote',
      password,
      version: '1',
    });
    await expect(other.listen(port)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
  });
});

describe('MCP endpoint', () => {
  const mcp = (body: unknown, headers: Record<string, string> = {}) =>
    send('/mcp', {
      method: 'POST',
      headers: { ...json, ...headers },
      body: JSON.stringify(body),
    });

  it('answers JSON-RPC requests', async () => {
    const response = await mcp({ jsonrpc: '2.0', id: 7, method: 'ping' });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toEqual({
      jsonrpc: '2.0',
      id: 7,
      result: {},
    });
  });

  it('accepts notifications with an empty 202', async () => {
    const response = await mcp({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(response.status).toBe(202);
    expect(response.text).toBe('');
  });

  it('does not offer a server event stream', async () => {
    expect((await send('/mcp')).status).toBe(405);
  });

  it('rejects an unsupported protocol header', async () => {
    const response = await mcp(
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { 'mcp-protocol-version': '1999-01-01' },
    );
    expect(response.status).toBe(400);
  });

  it('stays behind the same login', async () => {
    const response = await mcp(
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { authorization: '' },
    );
    expect(response.status).toBe(401);
  });
});
