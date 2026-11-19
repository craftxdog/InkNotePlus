import { usableBaseUrl } from '../ai/compatible-provider';
import { SyncError } from './errors';

export interface CouchChange {
  id: string;
  deleted?: boolean;
  changes: { rev: string }[];
  doc?: Record<string, unknown> & { _rev?: string };
}
export interface BulkResult {
  id: string;
  ok?: boolean;
  rev?: string;
  error?: string;
}
export type CouchClient = ReturnType<typeof createCouchClient>;

export function createCouchClient(options: {
  url: string;
  username: string;
  password: string;
  database: string;
  fetcher?: typeof fetch;
}) {
  const base = usableBaseUrl(options.url);
  if (!base) throw new SyncError('bad_address');
  const authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`;
  const root = `${base}/${encodeURIComponent(options.database)}`;

  async function request(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await (options.fetcher ?? fetch)(`${root}${path}`, {
        ...init,
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
        headers: {
          accept: 'application/json',
          authorization,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new SyncError('unreachable');
    }
    if (response.status === 401) throw new SyncError('unauthorized');
    if (response.status === 403) throw new SyncError('forbidden');
    if (response.status >= 500) throw new SyncError('server');
    return response;
  }
  const docPath = (id: string) => `/${encodeURIComponent(id)}`;

  return {
    async ensureDatabase() {
      const existing = await request('');
      if (existing.ok) return;
      const created = await request('', { method: 'PUT' });
      if (!created.ok && created.status !== 412) throw new SyncError('server');
    },
    async get(id: string) {
      const response = await request(docPath(id));
      if (response.status === 404) return null;
      if (!response.ok) throw new SyncError('server');
      return (await response.json()) as Record<string, unknown>;
    },
    // Returns false when another device wrote the document first.
    async put(id: string, doc: Record<string, unknown>) {
      const response = await request(docPath(id), {
        method: 'PUT',
        body: JSON.stringify(doc),
      });
      if (response.status === 409) return false;
      if (!response.ok) throw new SyncError('server');
      return true;
    },
    async changes(since: string, limit: number) {
      const query = new URLSearchParams({
        since,
        limit: String(limit),
        include_docs: 'true',
      });
      const response = await request(`/_changes?${query}`);
      if (!response.ok) throw new SyncError('server');
      return (await response.json()) as {
        results: CouchChange[];
        last_seq: string;
      };
    },
    async bulkDocs(docs: readonly Record<string, unknown>[]) {
      const response = await request('/_bulk_docs', {
        method: 'POST',
        body: JSON.stringify({ docs }),
      });
      if (!response.ok) throw new SyncError('server');
      return (await response.json()) as BulkResult[];
    },
  };
}
