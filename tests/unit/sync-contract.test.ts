import { describe, expect, it } from 'vitest';

import {
  InvalidSyncContractError,
  compareSyncVersions,
  createSyncCheckpoint,
  createSyncOperation,
  createSyncPullRequest,
  type SyncAdapter,
  type SyncCheckpoint,
  type SyncOperation,
} from '../../src/domain/sync';

const checkpoint: SyncCheckpoint = {
  cursor: 'opaque-server-cursor',
  lastAppliedOperationId: 'operation-1',
  updatedAt: '2026-10-30T12:00:00.000Z',
};

describe('sync contract', () => {
  it('creates a stable, replayable upsert operation', () => {
    const operation = createSyncOperation({
      id: 'operation-1',
      entity: { type: 'note', id: 'note-1' },
      kind: 'upsert',
      payload: { title: 'Architecture' },
      version: {
        revision: 3,
        origin: { deviceId: 'desktop-a', sequence: 14 },
      },
      occurredAt: '2026-10-30T12:00:00.000Z',
    });

    expect(operation).toEqual({
      id: 'operation-1',
      entity: { type: 'note', id: 'note-1' },
      kind: 'upsert',
      payload: { title: 'Architecture' },
      version: {
        revision: 3,
        origin: { deviceId: 'desktop-a', sequence: 14 },
      },
      occurredAt: '2026-10-30T12:00:00.000Z',
    });
  });

  it('models tombstones without requiring deleted content', () => {
    const operation = createSyncOperation({
      id: 'operation-2',
      entity: { type: 'note', id: 'note-1' },
      kind: 'tombstone',
      payload: null,
      version: {
        revision: 4,
        origin: { deviceId: 'desktop-a', sequence: 15 },
      },
      occurredAt: '2026-10-30T12:01:00.000Z',
    });

    expect(operation).toMatchObject({ kind: 'tombstone', payload: null });
  });

  it('orders concurrent versions deterministically without a transport detail', () => {
    expect(
      compareSyncVersions(
        { revision: 2, origin: { deviceId: 'desktop-a', sequence: 8 } },
        { revision: 3, origin: { deviceId: 'desktop-a', sequence: 1 } },
      ),
    ).toBe(-1);
    expect(
      compareSyncVersions(
        { revision: 3, origin: { deviceId: 'desktop-a', sequence: 8 } },
        { revision: 3, origin: { deviceId: 'desktop-b', sequence: 1 } },
      ),
    ).toBe(-1);
    expect(
      compareSyncVersions(
        { revision: 3, origin: { deviceId: 'desktop-b', sequence: 8 } },
        { revision: 3, origin: { deviceId: 'desktop-b', sequence: 8 } },
      ),
    ).toBe(0);
  });

  it('rejects unstable IDs, invalid revisions and local timestamps', () => {
    expect(() =>
      createSyncOperation({
        id: 'has spaces',
        entity: { type: 'note', id: 'note-1' },
        kind: 'tombstone',
        payload: null,
        version: {
          revision: 1,
          origin: { deviceId: 'desktop-a', sequence: 0 },
        },
        occurredAt: '2026-10-30T12:00:00',
      }),
    ).toThrow(InvalidSyncContractError);
  });

  it('keeps adapter contracts transport-neutral and validates checkpoints', async () => {
    const adapter: SyncAdapter<{ title: string }> = {
      push: async (request) => ({
        acknowledgedOperationIds: request.operations.map(({ id }) => id),
        checkpoint,
      }),
      pull: async () => ({
        operations: [] as SyncOperation<{ title: string }>[],
        checkpoint,
        hasMore: false,
      }),
    };
    const validatedCheckpoint = createSyncCheckpoint(checkpoint);
    const request = createSyncPullRequest({
      checkpoint: validatedCheckpoint,
      limit: 50,
    });

    await expect(adapter.pull(request)).resolves.toMatchObject({
      checkpoint,
      hasMore: false,
    });
    expect(() =>
      createSyncPullRequest({ checkpoint: null, limit: 101 }),
    ).toThrow(InvalidSyncContractError);
  });
});
