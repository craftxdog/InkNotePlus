import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { Note } from '../../domain/note';
import {
  InvalidSyncContractError,
  createSyncCheckpoint,
  createSyncOperation,
  type NoteSyncOutbox,
  type SyncCheckpoint,
  type SyncOperation,
} from '../../domain/sync';

interface LocalStateRow {
  deviceId: string;
  nextSequence: number;
}

export class SqliteSyncOutbox implements NoteSyncOutbox {
  constructor(private readonly database: DatabaseSync) {
    this.ensureLocalState();
  }

  getDeviceId(): string {
    return this.readLocalState().deviceId;
  }

  recordNote(note: Note): SyncOperation<Note> {
    const localState = this.readLocalState();
    const base = {
      id: randomUUID(),
      entity: { type: 'note' as const, id: note.id },
      version: {
        revision: note.revision,
        origin: {
          deviceId: localState.deviceId,
          sequence: localState.nextSequence,
        },
      },
      occurredAt: note.updatedAt,
    };
    const operation =
      note.deletedAt === null
        ? createSyncOperation<Note>({ ...base, kind: 'upsert', payload: note })
        : createSyncOperation<Note>({
            ...base,
            kind: 'tombstone',
            payload: null,
          });

    this.database
      .prepare(`
        INSERT INTO sync_outbox (
          operation_id, entity_type, entity_id, kind, payload_json, revision,
          origin_device_id, origin_sequence, occurred_at, acknowledged_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(
        operation.id,
        operation.entity.type,
        operation.entity.id,
        operation.kind,
        operation.kind === 'upsert' ? JSON.stringify(operation.payload) : null,
        operation.version.revision,
        operation.version.origin.deviceId,
        operation.version.origin.sequence,
        operation.occurredAt,
      );
    const result = this.database
      .prepare(`
        UPDATE sync_local_state
        SET next_sequence = next_sequence + 1
        WHERE singleton = 1 AND next_sequence = ?
      `)
      .run(localState.nextSequence);
    if (result.changes !== 1) {
      throw new Error('Could not advance the local synchronization sequence.');
    }

    return operation;
  }

  listPending(limit = 50): readonly SyncOperation<Note>[] {
    assertLimit(limit);

    return this.database
      .prepare(`
        SELECT
          operation_id AS operationId,
          entity_type AS entityType,
          entity_id AS entityId,
          kind,
          payload_json AS payloadJson,
          revision,
          origin_device_id AS originDeviceId,
          origin_sequence AS originSequence,
          occurred_at AS occurredAt
        FROM sync_outbox
        WHERE acknowledged_at IS NULL
        ORDER BY origin_sequence ASC
        LIMIT ?
      `)
      .all(limit)
      .map(parseOutboxRow);
  }

  acknowledge(operationIds: readonly string[]): void {
    if (operationIds.length === 0) {
      return;
    }

    for (const operationId of operationIds) {
      assertStableIdentifier(operationId);
    }

    const placeholders = operationIds.map(() => '?').join(', ');
    this.database
      .prepare(`
        UPDATE sync_outbox
        SET acknowledged_at = ?
        WHERE acknowledged_at IS NULL AND operation_id IN (${placeholders})
      `)
      .run(new Date().toISOString(), ...operationIds);
  }

  getCheckpoint(targetId: string): SyncCheckpoint | null {
    assertStableIdentifier(targetId);
    const row = this.database
      .prepare(`
        SELECT
          cursor,
          last_applied_operation_id AS lastAppliedOperationId,
          updated_at AS updatedAt
        FROM sync_checkpoints
        WHERE target_id = ?
      `)
      .get(targetId);

    return row ? parseCheckpointRow(row) : null;
  }

  setCheckpoint(targetId: string, checkpoint: SyncCheckpoint): void {
    assertStableIdentifier(targetId);
    const validatedCheckpoint = createSyncCheckpoint(checkpoint);

    this.database
      .prepare(`
        INSERT INTO sync_checkpoints (
          target_id, cursor, last_applied_operation_id, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(target_id) DO UPDATE SET
          cursor = excluded.cursor,
          last_applied_operation_id = excluded.last_applied_operation_id,
          updated_at = excluded.updated_at
      `)
      .run(
        targetId,
        validatedCheckpoint.cursor,
        validatedCheckpoint.lastAppliedOperationId,
        validatedCheckpoint.updatedAt,
      );
  }

  private ensureLocalState(): void {
    this.database
      .prepare(`
        INSERT INTO sync_local_state (singleton, device_id, next_sequence)
        VALUES (1, ?, 0)
        ON CONFLICT(singleton) DO NOTHING
      `)
      .run(randomUUID());
  }

  private readLocalState(): LocalStateRow {
    const row = this.database
      .prepare(`
        SELECT device_id AS deviceId, next_sequence AS nextSequence
        FROM sync_local_state
        WHERE singleton = 1
      `)
      .get();
    if (!row) {
      throw new Error('Missing local synchronization state.');
    }

    const deviceId = readString(row, 'deviceId');
    const nextSequence = readInteger(row, 'nextSequence');
    assertStableIdentifier(deviceId);
    if (nextSequence < 0) {
      throw new Error('Invalid local synchronization state.');
    }

    return { deviceId, nextSequence };
  }
}

function parseOutboxRow(row: Record<string, unknown>): SyncOperation<Note> {
  const id = readString(row, 'operationId');
  const entityType = readEntityType(row, 'entityType');
  const entityId = readString(row, 'entityId');
  const kind = readString(row, 'kind');
  const revision = readPositiveInteger(row, 'revision');
  const deviceId = readString(row, 'originDeviceId');
  const sequence = readInteger(row, 'originSequence');
  const occurredAt = readString(row, 'occurredAt');
  const payloadJson = readNullableString(row, 'payloadJson');
  const base = {
    id,
    entity: { type: entityType, id: entityId },
    version: { revision, origin: { deviceId, sequence } },
    occurredAt,
  } as const;

  if (kind === 'tombstone') {
    if (payloadJson !== null) {
      throw new Error('Invalid tombstone operation in the local outbox.');
    }
    return createSyncOperation({ ...base, kind, payload: null });
  }
  if (kind !== 'upsert' || payloadJson === null) {
    throw new Error('Invalid sync operation in the local outbox.');
  }

  const payload = parseNotePayload(payloadJson);
  if (payload.id !== entityId || payload.revision !== revision) {
    throw new Error('Invalid note payload in the local outbox.');
  }

  return createSyncOperation({ ...base, kind, payload });
}

function parseCheckpointRow(row: Record<string, unknown>): SyncCheckpoint {
  return createSyncCheckpoint({
    cursor: readNullableString(row, 'cursor'),
    lastAppliedOperationId: readNullableString(row, 'lastAppliedOperationId'),
    updatedAt: readString(row, 'updatedAt'),
  });
}

function parseNotePayload(payloadJson: string): Note {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson);
  } catch {
    throw new Error('Invalid note payload in the local outbox.');
  }
  if (!isRecord(value)) {
    throw new Error('Invalid note payload in the local outbox.');
  }

  const note = {
    id: readString(value, 'id'),
    title: readString(value, 'title'),
    body: readString(value, 'body'),
    isPinned: readBoolean(value, 'isPinned'),
    createdAt: readString(value, 'createdAt'),
    updatedAt: readString(value, 'updatedAt'),
    deletedAt: readNullableString(value, 'deletedAt'),
    revision: readPositiveInteger(value, 'revision'),
  };
  assertIsoTimestamp(note.createdAt);
  assertIsoTimestamp(note.updatedAt);
  if (note.deletedAt !== null) {
    assertIsoTimestamp(note.deletedAt);
  }

  return note;
}

function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new InvalidSyncContractError();
  }
}

function assertStableIdentifier(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new InvalidSyncContractError();
  }
}

function assertIsoTimestamp(value: string): void {
  if (
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error('Invalid note payload in the local outbox.');
  }
}

function readEntityType(
  row: Record<string, unknown>,
  key: string,
): 'note' | 'notebook' | 'tag' {
  const value = readString(row, key);
  if (value === 'note' || value === 'notebook' || value === 'tag') {
    return value;
  }

  throw new Error('Invalid sync entity type in the local outbox.');
}

function readString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new Error('Invalid local synchronization data.');
  }

  return value;
}

function readNullableString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = row[key];
  if (value === null || typeof value === 'string') {
    return value;
  }

  throw new Error('Invalid local synchronization data.');
}

function readInteger(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Invalid local synchronization data.');
  }

  return value;
}

function readPositiveInteger(
  row: Record<string, unknown>,
  key: string,
): number {
  const value = readInteger(row, key);
  if (value < 1) {
    throw new Error('Invalid local synchronization data.');
  }

  return value;
}

function readBoolean(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') {
    throw new Error('Invalid local synchronization data.');
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
