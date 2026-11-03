import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { SqliteNoteRepository } from '../../src/infrastructure/sqlite/sqlite-note-repository';
import { SqliteSyncOutbox } from '../../src/infrastructure/sqlite/sqlite-sync-outbox';

describe('SqliteSyncOutbox', () => {
  let database: DatabaseSync;
  let outbox: SqliteSyncOutbox;
  let repository: SqliteNoteRepository;

  beforeEach(() => {
    database = openDatabase(':memory:');
    outbox = new SqliteSyncOutbox(database);
    repository = new SqliteNoteRepository(database, outbox);
  });

  afterEach(() => {
    database.close();
  });
  it('reads legacy operations without metadata and rejects malformed new metadata', () => {
    repository.create({ title: 'Legacy', body: 'unchanged' });
    database.exec(
      "UPDATE sync_outbox SET payload_json = json_remove(payload_json, '$.metadata')",
    );
    expect(outbox.listPending()[0]).toMatchObject({
      kind: 'upsert',
      payload: { title: 'Legacy', body: 'unchanged' },
    });
    database.exec(
      "UPDATE sync_outbox SET payload_json = json_set(payload_json, '$.metadata', 'invalid')",
    );
    expect(() => outbox.listPending()).toThrow();
  });

  it('records ordered note operations with one persistent device identity', () => {
    const created = repository.create({ title: 'Draft', body: 'v1' });
    repository.update({
      id: created.id,
      title: 'Draft',
      body: 'v2',
      expectedRevision: created.revision,
    });

    const operations = outbox.listPending();
    const deviceId = outbox.getDeviceId();

    expect(operations).toMatchObject([
      {
        entity: { type: 'note', id: created.id },
        kind: 'upsert',
        payload: expect.objectContaining({ body: 'v1', revision: 1 }),
        version: { revision: 1, origin: { deviceId, sequence: 0 } },
      },
      {
        entity: { type: 'note', id: created.id },
        kind: 'upsert',
        payload: expect.objectContaining({ body: 'v2', revision: 2 }),
        version: { revision: 2, origin: { deviceId, sequence: 1 } },
      },
    ]);
    expect(new SqliteSyncOutbox(database).getDeviceId()).toBe(deviceId);
  });

  it('records a tombstone and a later upsert for trash and restore', () => {
    const created = repository.create({ title: 'Inbox', body: '' });
    const trashed = repository.moveToTrash(created.id);
    const restored = repository.restore(created.id);

    expect(
      outbox.listPending().map(({ kind, payload, version }) => ({
        kind,
        payload,
        revision: version.revision,
      })),
    ).toEqual([
      expect.objectContaining({ kind: 'upsert', revision: 1 }),
      { kind: 'tombstone', payload: null, revision: trashed.revision },
      expect.objectContaining({
        kind: 'upsert',
        payload: expect.objectContaining({ id: restored.id }),
        revision: restored.revision,
      }),
    ]);
  });

  it('acknowledges only confirmed operations and persists provider checkpoints', () => {
    const first = repository.create({ title: 'First', body: '' });
    const second = repository.create({ title: 'Second', body: '' });
    const [firstOperation, secondOperation] = outbox.listPending();

    outbox.acknowledge([firstOperation.id]);
    outbox.setCheckpoint('inkdrop-cloud', {
      cursor: 'cursor-1',
      lastAppliedOperationId: secondOperation.id,
      updatedAt: '2026-11-02T12:00:00.000Z',
    });

    expect(outbox.listPending()).toEqual([
      expect.objectContaining({ entity: { id: second.id, type: 'note' } }),
    ]);
    expect(outbox.getCheckpoint('inkdrop-cloud')).toEqual({
      cursor: 'cursor-1',
      lastAppliedOperationId: secondOperation.id,
      updatedAt: '2026-11-02T12:00:00.000Z',
    });
    expect(first.id).not.toBe(second.id);
  });
});
