import { createHash, randomUUID } from 'node:crypto';

interface Stored {
  rev: string;
  deleted: boolean;
  body: Record<string, unknown>;
  seq: number;
}

// The subset of CouchDB's HTTP API that InkNote uses, for runs without a server.
export function createFakeCouch(credentials = { user: 'u', password: 'p' }) {
  const databases = new Map<string, Map<string, Stored>>();
  let sequence = 0;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });
  const nextRev = (previous: string | undefined, body: unknown) => {
    const generation = Number(previous?.split('-')[0] ?? 0) + 1;
    const hash = createHash('md5')
      .update(JSON.stringify(body) + randomUUID())
      .digest('hex');
    return `${generation}-${hash}`;
  };
  function write(database: Map<string, Stored>, doc: Record<string, unknown>) {
    const { _id, _rev, _deleted, ...body } = doc as {
      _id: string;
      _rev?: string;
      _deleted?: boolean;
    };
    const current = database.get(_id);
    const live = current && !current.deleted;
    if (live ? current.rev !== _rev : _rev && current?.rev !== _rev)
      return {
        id: _id,
        error: 'conflict',
        reason: 'Document update conflict.',
      };
    const rev = nextRev(current?.rev, body);
    database.set(_id, {
      rev,
      deleted: !!_deleted,
      body,
      seq: ++sequence,
    });
    return { ok: true, id: _id, rev };
  }
  const fetcher = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const expected = `Basic ${btoa(`${credentials.user}:${credentials.password}`)}`;
    if (url.pathname === '/')
      return json(200, { couchdb: 'Welcome', version: 'fake' });
    if (headers.get('authorization') !== expected)
      return json(401, { error: 'unauthorized' });
    const [name, ...rest] = url.pathname
      .slice(1)
      .split('/')
      .map(decodeURIComponent);
    const method = init.method ?? 'GET';
    const resource = rest.join('/');
    if (!resource) {
      if (method === 'PUT') {
        if (databases.has(name)) return json(412, { error: 'file_exists' });
        databases.set(name, new Map());
        return json(201, { ok: true });
      }
      return databases.has(name)
        ? json(200, { db_name: name })
        : json(404, { error: 'not_found' });
    }
    const database = databases.get(name);
    if (!database) return json(404, { error: 'not_found' });
    if (resource === '_changes') {
      const since = Number(url.searchParams.get('since') ?? 0) || 0;
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      const results = [...database]
        .filter(([, doc]) => doc.seq > since)
        .sort((a, b) => a[1].seq - b[1].seq)
        .slice(0, limit)
        .map(([id, doc]) => ({
          id,
          seq: String(doc.seq),
          changes: [{ rev: doc.rev }],
          ...(doc.deleted ? { deleted: true } : {}),
          doc: {
            _id: id,
            _rev: doc.rev,
            ...(doc.deleted ? { _deleted: true } : doc.body),
          },
        }));
      return json(200, {
        results,
        last_seq: results.at(-1)?.seq ?? String(since),
        pending: 0,
      });
    }
    if (resource === '_bulk_docs') {
      const { docs } = JSON.parse(String(init.body)) as {
        docs: Record<string, unknown>[];
      };
      return json(
        201,
        docs.map((doc) => write(database, doc)),
      );
    }
    if (method === 'PUT') {
      const result = write(database, {
        ...(JSON.parse(String(init.body)) as object),
        _id: resource,
      });
      return 'ok' in result ? json(201, result) : json(409, result);
    }
    const doc = database.get(resource);
    return doc && !doc.deleted
      ? json(200, { _id: resource, _rev: doc.rev, ...doc.body })
      : json(404, { error: 'not_found' });
  }) as typeof fetch;
  return { fetcher, databases };
}
