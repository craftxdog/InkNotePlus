import { createHash } from 'node:crypto';
import type { CouchChange, CouchClient } from './couch-client';
import { decryptDocument, encryptDocument, sealedSchema } from './crypto';
import { SyncError } from './errors';

export interface SyncNoteContent {
  type: 'note';
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata: unknown;
}
export type SyncContent =
  | SyncNoteContent
  | {
      type: 'book';
      id: string;
      name: string;
      parentId: string | null;
      createdAt: string;
      icon: string;
      position: number;
    }
  | { type: 'tag'; name: string; color: string | null }
  | { type: 'file'; name: string; data: string };

export interface LocalDocument {
  docId: string;
  hash: string;
  load: () => SyncContent | null;
}
export interface SyncStore {
  listLocal(): { documents: LocalDocument[]; skippedFiles: number };
  known(): Map<string, { rev: string; hash: string }>;
  remember(docId: string, rev: string, hash: string): void;
  forget(docId: string): void;
  getCursor(targetId: string): string;
  setCursor(targetId: string, cursor: string): void;
  apply(content: SyncContent): void;
  remove(docId: string): void;
  copyAsConflict(note: SyncNoteContent): void;
  localContent(docId: string): SyncContent | null;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  unreadable: number;
  skippedFiles: number;
}

const pageSize = 200;
const minMassDelete = 10;
const maxBatchBytes = 3 * 1024 * 1024;
const managedDocument = /^(note|book|tag|file):/;
const applyOrder = { book: 0, tag: 1, file: 2, note: 3 } as const;

// An image name already contains the hash of its bytes.
export const contentHash = (content: SyncContent) =>
  content.type === 'file'
    ? content.name
    : createHash('sha256').update(JSON.stringify(content)).digest('hex');

function orderBooks(items: { content: SyncContent }[]) {
  const ids = new Map(
    items.flatMap(({ content }) =>
      content.type === 'book' ? [[content.id, content.parentId] as const] : [],
    ),
  );
  const depth = (id: string | null, seen = new Set<string>()): number => {
    const parent = id ? ids.get(id) : undefined;
    if (!id || !parent || seen.has(id)) return 0;
    seen.add(id);
    return 1 + depth(parent, seen);
  };
  return (content: SyncContent) =>
    content.type === 'book' ? depth(content.id) : 0;
}

async function pull(
  client: CouchClient,
  store: SyncStore,
  key: Buffer,
  targetId: string,
  result: SyncResult,
) {
  let cursor = store.getCursor(targetId);
  for (;;) {
    const page = await client.changes(cursor, pageSize);
    const known = store.known();
    const upserts: {
      change: CouchChange;
      content: SyncContent;
      rev: string;
    }[] = [];
    const removals: CouchChange[] = [];
    for (const change of page.results) {
      if (!managedDocument.test(change.id)) continue;
      const rev = change.changes[0]?.rev;
      if (!rev || known.get(change.id)?.rev === rev) continue;
      if (change.deleted) {
        removals.push(change);
        continue;
      }
      const sealed = sealedSchema.safeParse(change.doc?.sealed);
      try {
        if (!sealed.success) throw new Error('unreadable');
        upserts.push({
          change,
          rev,
          content: decryptDocument(key, change.id, sealed.data) as SyncContent,
        });
      } catch {
        result.unreadable += 1;
      }
    }
    const depth = orderBooks(upserts);
    upserts.sort(
      (a, b) =>
        applyOrder[a.content.type] - applyOrder[b.content.type] ||
        depth(a.content) - depth(b.content),
    );
    for (const { change, content, rev } of upserts)
      applyRemote(store, known, change.id, content, rev, result);
    // Notes leave first so a deleted notebook does not rewrite them.
    removals.sort((a, b) => removalRank(a.id) - removalRank(b.id));
    for (const change of removals) {
      const previous = known.get(change.id);
      const local = store.localContent(change.id);
      const edited =
        local !== null && previous && contentHash(local) !== previous.hash;
      // A local edit outlives a remote delete, so the note is sent again.
      store.forget(change.id);
      if (!edited && local !== null) {
        store.remove(change.id);
        result.pulled += 1;
      }
    }
    cursor = page.last_seq;
    store.setCursor(targetId, cursor);
    if (page.results.length < pageSize) return;
  }
}

const removalRank = (id: string) =>
  id.startsWith('note:') ? 0 : id.startsWith('tag:') ? 1 : 2;

function applyRemote(
  store: SyncStore,
  known: ReturnType<SyncStore['known']>,
  docId: string,
  content: SyncContent,
  rev: string,
  result: SyncResult,
) {
  const remoteHash = contentHash(content);
  const local = store.localContent(docId);
  const localHash = local && contentHash(local);
  if (localHash === remoteHash) {
    store.remember(docId, rev, remoteHash);
    return;
  }
  const edited = !!local && localHash !== known.get(docId)?.hash;
  if (edited && local.type === 'note' && content.type === 'note') {
    const differs =
      local.title !== content.title || local.body !== content.body;
    const remoteWins = content.updatedAt >= local.updatedAt;
    if (differs) {
      store.copyAsConflict(remoteWins ? local : content);
      result.conflicts += 1;
    }
    if (!remoteWins) {
      // The local version stays and replaces the remote one on the next push.
      store.remember(docId, rev, remoteHash);
      return;
    }
  }
  store.apply(content);
  store.remember(docId, rev, remoteHash);
  result.pulled += 1;
}

async function push(
  client: CouchClient,
  store: SyncStore,
  key: Buffer,
  result: SyncResult,
) {
  const { documents, skippedFiles } = store.listLocal();
  result.skippedFiles = skippedFiles;
  const known = store.known();
  const present = new Set(documents.map(({ docId }) => docId));
  let batch: { doc: Record<string, unknown>; hash: string | null }[] = [];
  let bytes = 0;

  async function flush() {
    if (!batch.length) return;
    const sent = batch;
    batch = [];
    bytes = 0;
    const answers = await client.bulkDocs(sent.map(({ doc }) => doc));
    answers.forEach((answer, index) => {
      // A conflict means another device was first, so the next pull resolves it.
      if (!answer.ok || !answer.rev) return;
      const { hash } = sent[index];
      if (hash === null) store.forget(answer.id);
      else store.remember(answer.id, answer.rev, hash);
      result.pushed += 1;
    });
  }
  async function add(doc: Record<string, unknown>, hash: string | null) {
    const size = JSON.stringify(doc).length;
    if (bytes + size > maxBatchBytes || batch.length >= pageSize) await flush();
    batch.push({ doc, hash });
    bytes += size;
  }

  for (const { docId, hash, load } of documents) {
    const previous = known.get(docId);
    if (previous?.hash === hash) continue;
    const content = load();
    if (!content) continue;
    await add(
      {
        _id: docId,
        ...(previous ? { _rev: previous.rev } : {}),
        docType: content.type,
        sealed: encryptDocument(key, docId, content),
      },
      hash,
    );
  }
  const missing = [...known].filter(
    ([docId]) => !present.has(docId) && !docId.startsWith('file:'),
  );
  // A restored backup or damaged library must not erase every other device.
  if (missing.length >= minMassDelete && missing.length > known.size / 2)
    throw new SyncError('mass_delete');
  for (const [docId, { rev }] of missing)
    await add({ _id: docId, _rev: rev, _deleted: true }, null);
  await flush();
}

export async function runSync(options: {
  client: CouchClient;
  store: SyncStore;
  key: Buffer;
  targetId: string;
}): Promise<SyncResult> {
  const result: SyncResult = {
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    unreadable: 0,
    skippedFiles: 0,
  };
  await pull(
    options.client,
    options.store,
    options.key,
    options.targetId,
    result,
  );
  await push(options.client, options.store, options.key, result);
  return result;
}
