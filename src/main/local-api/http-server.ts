import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NotesBackend } from './notes-backend';
import { handleApiRequest } from './routes';
import { clipPageSchema, type ClipPage } from './clip';
import { handleMcpMessage, mcpProtocolVersions } from './mcp';

const maxBodyBytes = 2 * 1024 * 1024;
const maxFailures = 20;
const failureWindow = 60_000;

const digest = (value: string) => createHash('sha256').update(value).digest();

function send(
  response: ServerResponse,
  status: number,
  body?: unknown,
  corsOrigin?: string,
) {
  response.writeHead(status, {
    ...(corsOrigin
      ? {
          'access-control-allow-origin': corsOrigin,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'access-control-max-age': '600',
          vary: 'Origin',
        }
      : {}),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(status === 401
      ? { 'www-authenticate': 'Basic realm="InkNote", charset="UTF-8"' }
      : {}),
    ...(body === undefined
      ? {}
      : { 'content-type': 'application/json; charset=utf-8' }),
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

// Everything is read so the client can receive the answer before it stops sending.
function readBody(request: IncomingMessage) {
  return new Promise<string | null>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= maxBodyBytes) chunks.push(chunk);
    });
    request.on('end', () =>
      resolve(size > maxBodyBytes ? null : Buffer.concat(chunks).toString()),
    );
    request.on('error', reject);
  });
}

export function createLocalApiServer(options: {
  backend: NotesBackend;
  username: string;
  password: string;
  version: string;
  // Browser extensions the user allowed by their exact origin.
  allowedOrigins?: () => readonly string[];
  clip?: (page: ClipPage) => Promise<{ title: string; body: string }>;
}) {
  const expected = digest(`${options.username}:${options.password}`);
  let server: Server | null = null;
  let port = 0;
  let failures: number[] = [];

  const authorized = (header: string | undefined) => {
    if (!header?.startsWith('Basic ')) return false;
    const supplied = Buffer.from(header.slice(6), 'base64').toString();
    return timingSafeEqual(digest(supplied), expected);
  };

  async function handle(request: IncomingMessage, response: ServerResponse) {
    // Browsers always send Origin on cross-site writes, and rebinding changes Host.
    // Only the extensions the user allowed may send one.
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = request.headers.origin;
    const extension =
      origin !== undefined &&
      (options.allowedOrigins?.() ?? []).includes(origin)
        ? origin
        : undefined;
    if (
      !hosts.includes(request.headers.host ?? '') ||
      (origin !== undefined && !extension)
    )
      return send(response, 403, { error: 'Origen no permitido.' });
    const reply = (status: number, body?: unknown) =>
      send(response, status, body, extension);
    if (extension && request.method === 'OPTIONS') return reply(204);
    const now = Date.now();
    failures = failures.filter((time) => now - time < failureWindow);
    if (failures.length >= maxFailures)
      return reply(429, { error: 'Demasiados intentos.' });
    if (!authorized(request.headers.authorization)) {
      failures.push(now);
      return reply(401, { error: 'Credenciales no válidas.' });
    }
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let body: unknown;
    if (method === 'POST' || method === 'PATCH') {
      const type = request.headers['content-type'] ?? '';
      const text = await readBody(request);
      if (text === null)
        return reply(413, {
          error: 'El contenido es demasiado grande.',
        });
      if (!/^application\/json\b/i.test(type))
        return reply(415, { error: 'Usa application/json.' });
      try {
        body = JSON.parse(text);
      } catch {
        return reply(400, { error: 'JSON no válido.' });
      }
    }
    if (url.pathname === '/')
      return method === 'GET'
        ? reply(200, { name: 'InkNote', version: options.version })
        : reply(405, { error: 'Método no admitido.' });
    if (url.pathname === '/clip' && options.clip) {
      if (method !== 'POST')
        return reply(405, { error: 'Método no admitido.' });
      const page = clipPageSchema.safeParse(body);
      if (!page.success) return reply(400, { error: 'Solicitud no válida.' });
      const { tags, bookId, ...source } = page.data;
      const clipped = await options.clip(source);
      const site = new URL(source.url).host;
      const created = await handleApiRequest(
        {
          method: 'POST',
          path: '/notes',
          query: new URLSearchParams(),
          body: {
            title: clipped.title.slice(0, 512) || site,
            body: `> Fuente: [${site}](${source.url})\n\n${clipped.body}`,
            ...(tags ? { tags } : {}),
            ...(bookId ? { bookId } : {}),
          },
        },
        options.backend,
      );
      return reply(created.status, created.body);
    }
    if (url.pathname === '/mcp') {
      // Answers are plain JSON, so there is no event stream to open with GET.
      if (method !== 'POST')
        return reply(405, { error: 'Método no admitido.' });
      const protocol = request.headers['mcp-protocol-version'];
      if (
        protocol !== undefined &&
        !mcpProtocolVersions.some((version) => version === protocol)
      )
        return reply(400, { error: 'Versión de MCP no admitida.' });
      const answer = await handleMcpMessage(
        body,
        options.backend,
        options.version,
      );
      return answer ? reply(200, answer) : reply(202);
    }
    const result = await handleApiRequest(
      { method, path: url.pathname, query: url.searchParams, body },
      options.backend,
    );
    reply(result.status, result.body);
  }

  return {
    listen(requestedPort: number) {
      return new Promise<number>((resolve, reject) => {
        const instance = createServer((request, response) => {
          handle(request, response).catch(() => {
            if (!response.headersSent)
              send(response, 500, { error: 'Error interno.' });
            else response.destroy();
          });
        });
        instance.requestTimeout = 30_000;
        instance.headersTimeout = 10_000;
        instance.once('error', reject);
        instance.listen(requestedPort, '127.0.0.1', () => {
          instance.off('error', reject);
          server = instance;
          port = (instance.address() as AddressInfo).port;
          resolve(port);
        });
      });
    },
    address: () => server?.address() as AddressInfo | null,
    close() {
      return new Promise<void>((resolve) => {
        if (!server) return resolve();
        const closing = server;
        server = null;
        closing.close(() => resolve());
        closing.closeAllConnections();
      });
    },
  };
}
