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
import { handleMcpMessage, mcpProtocolVersions } from './mcp';

const maxBodyBytes = 2 * 1024 * 1024;
const maxFailures = 20;
const failureWindow = 60_000;

const digest = (value: string) => createHash('sha256').update(value).digest();

function send(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, {
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
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (
      !hosts.includes(request.headers.host ?? '') ||
      request.headers.origin !== undefined
    )
      return send(response, 403, { error: 'Origen no permitido.' });
    const now = Date.now();
    failures = failures.filter((time) => now - time < failureWindow);
    if (failures.length >= maxFailures)
      return send(response, 429, { error: 'Demasiados intentos.' });
    if (!authorized(request.headers.authorization)) {
      failures.push(now);
      return send(response, 401, { error: 'Credenciales no válidas.' });
    }
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let body: unknown;
    if (method === 'POST' || method === 'PATCH') {
      const type = request.headers['content-type'] ?? '';
      const text = await readBody(request);
      if (text === null)
        return send(response, 413, {
          error: 'El contenido es demasiado grande.',
        });
      if (!/^application\/json\b/i.test(type))
        return send(response, 415, { error: 'Usa application/json.' });
      try {
        body = JSON.parse(text);
      } catch {
        return send(response, 400, { error: 'JSON no válido.' });
      }
    }
    if (url.pathname === '/')
      return method === 'GET'
        ? send(response, 200, { name: 'InkNote', version: options.version })
        : send(response, 405, { error: 'Método no admitido.' });
    if (url.pathname === '/mcp') {
      // Answers are plain JSON, so there is no event stream to open with GET.
      if (method !== 'POST')
        return send(response, 405, { error: 'Método no admitido.' });
      const protocol = request.headers['mcp-protocol-version'];
      if (
        protocol !== undefined &&
        !mcpProtocolVersions.some((version) => version === protocol)
      )
        return send(response, 400, { error: 'Versión de MCP no admitida.' });
      const answer = await handleMcpMessage(
        body,
        options.backend,
        options.version,
      );
      return answer ? send(response, 200, answer) : send(response, 202);
    }
    const result = await handleApiRequest(
      { method, path: url.pathname, query: url.searchParams, body },
      options.backend,
    );
    send(response, result.status, result.body);
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
