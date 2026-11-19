import type { SyncDiagnostic } from '../../shared/sync';
import { usableBaseUrl } from '../ai/compatible-provider';

export async function diagnoseConnection(options: {
  url: string;
  username: string;
  password: string;
  database: string;
  fetcher: typeof fetch;
  resolveProxy: (url: string) => Promise<string>;
}) {
  const steps: SyncDiagnostic[] = [];
  const base = usableBaseUrl(options.url);
  if (!base) {
    steps.push({
      step: 'address',
      ok: false,
      detail: 'Usa https://, o http:// solo para un servidor en este equipo.',
    });
    return steps;
  }
  steps.push({ step: 'address', ok: true, detail: base });
  const proxy = await options.resolveProxy(base).catch(() => 'DIRECT');
  steps.push({ step: 'proxy', ok: true, detail: proxy });
  const request = (path: string, headers: Record<string, string> = {}) =>
    options.fetcher(`${base}${path}`, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json', ...headers },
    });
  const authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`;
  try {
    // A hardened server also asks for the login on its welcome page.
    const welcome = await request('/', { authorization });
    if (welcome.status === 401 || welcome.status === 403) {
      steps.push(
        { step: 'server', ok: true, detail: 'Servidor protegido.' },
        {
          step: 'login',
          ok: false,
          detail: 'El servidor rechazó el usuario o la contraseña.',
        },
      );
      return steps;
    }
    const body = (await welcome.json().catch(() => null)) as {
      couchdb?: unknown;
      version?: unknown;
    } | null;
    if (!welcome.ok || !body?.couchdb) {
      steps.push({
        step: 'server',
        ok: false,
        detail: 'La dirección responde, pero no parece un servidor CouchDB.',
      });
      return steps;
    }
    steps.push({
      step: 'server',
      ok: true,
      detail: `CouchDB ${String(body.version ?? '')}`.trim(),
    });
  } catch {
    steps.push({
      step: 'server',
      ok: false,
      detail: 'No se pudo conectar. Revisa la dirección, la red y el proxy.',
    });
    return steps;
  }
  try {
    const login = await request(`/${encodeURIComponent(options.database)}`, {
      authorization,
    });
    const rejected = login.status === 401 || login.status === 403;
    steps.push({
      step: 'login',
      ok: !rejected,
      detail: rejected
        ? 'El servidor rechazó el usuario o la contraseña.'
        : login.status === 404
          ? 'Acceso correcto. La base de datos se creará al conectar.'
          : 'Acceso correcto.',
    });
  } catch {
    steps.push({
      step: 'login',
      ok: false,
      detail: 'El servidor dejó de responder.',
    });
  }
  return steps;
}
