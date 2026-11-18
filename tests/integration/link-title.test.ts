import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fetchPageTitle,
  isPublicAddress,
  parsePageTitle,
} from '../../src/main/link-title';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});
type Handler = Parameters<typeof createServer>[1];
async function serve(handler: NonNullable<Handler>) {
  const hits: { url?: string; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((request, response) => {
    hits.push({ url: request.url, headers: request.headers });
    handler(request, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { hits, port, url: `http://127.0.0.1:${port}/` };
}
const html =
  (body: string) =>
  (_: unknown, response: import('node:http').ServerResponse) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(body);
  };
const allow = { allowAddress: () => true };

describe('public address check', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'no-es-ip',
  ])('rejects %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'accepts %s',
    (address) => expect(isPublicAddress(address)).toBe(true),
  );
});

describe('page title parsing', () => {
  it('reads and cleans the document title', () => {
    expect(
      parsePageTitle(
        '<head><TITLE lang="es">\n  Caf&eacute; &amp; t&#233;\n &#x2014; Guía </TITLE></head>',
      ),
    ).toBe('Café & té — Guía');
  });
  it('falls back to the Open Graph title', () => {
    expect(
      parsePageTitle(
        '<meta content="Título &quot;social&quot;" property="og:title">',
      ),
    ).toBe('Título "social"');
  });
  it('removes markup and limits the length', () => {
    expect(parsePageTitle('<title><b>Hola</b></title>')).toBe('Hola');
    expect(parsePageTitle(`<title>${'x'.repeat(500)}</title>`)).toHaveLength(
      200,
    );
  });
  it('returns nothing for an empty or missing title', () => {
    expect(parsePageTitle('<title>   </title>')).toBeNull();
    expect(parsePageTitle('<p>sin título</p>')).toBeNull();
  });
});

describe('fetching a page title', () => {
  it('sends no identifying data and returns the title', async () => {
    const { url, hits } = await serve(html('<title>Página</title>'));
    await expect(fetchPageTitle(url, allow)).resolves.toBe('Página');
    expect(hits[0].headers.cookie).toBeUndefined();
    expect(hits[0].headers.referer).toBeUndefined();
    expect(hits[0].headers['user-agent']).toBe('InkNote');
  });
  it('decodes the charset declared by the server', async () => {
    const { url } = await serve((_, response) => {
      response.setHeader('content-type', 'text/html; charset=iso-8859-1');
      response.end(Buffer.from('<title>Canción</title>', 'latin1'));
    });
    await expect(fetchPageTitle(url, allow)).resolves.toBe('Canción');
  });
  it('blocks loopback addresses before connecting', async () => {
    const { url, port, hits } = await serve(html('<title>Interno</title>'));
    await expect(fetchPageTitle(url)).resolves.toBeNull();
    await expect(
      fetchPageTitle(`http://localhost:${port}/`),
    ).resolves.toBeNull();
    expect(hits).toHaveLength(0);
  });
  it('follows redirects and checks each destination', async () => {
    const target = await serve(html('<title>Destino</title>'));
    const first = await serve((_, response) => {
      response.writeHead(302, { location: target.url }).end();
    });
    await expect(fetchPageTitle(first.url, allow)).resolves.toBe('Destino');
    target.hits.length = 0;
    let checks = 0;
    await expect(
      fetchPageTitle(first.url, { allowAddress: () => checks++ === 0 }),
    ).resolves.toBeNull();
    expect(target.hits).toHaveLength(0);
  });
  it.each(['file:///etc/passwd', 'http://user:pass@example.com/'])(
    'refuses a redirect to %s',
    async (location) => {
      const { url } = await serve((_, response) => {
        response.writeHead(302, { location }).end();
      });
      await expect(fetchPageTitle(url, allow)).resolves.toBeNull();
    },
  );
  it('stops after too many redirects', async () => {
    const { url, hits } = await serve((request, response) => {
      response.writeHead(302, { location: `${request.url}x` }).end();
    });
    await expect(fetchPageTitle(url, allow)).resolves.toBeNull();
    expect(hits.length).toBeLessThanOrEqual(4);
  });
  it('ignores other content types and failed responses', async () => {
    const image = await serve((_, response) => {
      response.setHeader('content-type', 'image/png');
      response.end('<title>No</title>');
    });
    const missing = await serve((_, response) => {
      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<title>404</title>');
    });
    await expect(fetchPageTitle(image.url, allow)).resolves.toBeNull();
    await expect(fetchPageTitle(missing.url, allow)).resolves.toBeNull();
  });
  it('does not read past the size limit', async () => {
    const { url } = await serve(
      html(`${'x'.repeat(4096)}<title>Tarde</title>`),
    );
    await expect(
      fetchPageTitle(url, { ...allow, maxBytes: 1024 }),
    ).resolves.toBeNull();
  });
  it('gives up on a slow server', async () => {
    const { url } = await serve(() => {});
    await expect(
      fetchPageTitle(url, { ...allow, timeoutMs: 50 }),
    ).resolves.toBeNull();
  });
  it('rejects invalid input without a request', async () => {
    await expect(
      fetchPageTitle('javascript:alert(1)', allow),
    ).resolves.toBeNull();
    await expect(fetchPageTitle('no es url', allow)).resolves.toBeNull();
  });
});
