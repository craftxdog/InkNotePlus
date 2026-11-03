export type SyncEntityType = 'note' | 'notebook' | 'tag';

export type SyncOperation<TPayload> =
  | SyncUpsertOperation<TPayload>
  | SyncTombstoneOperation;

export interface SyncOperationBase {
  readonly id: string;
  readonly entity: SyncEntityRef;
  readonly version: SyncVersion;
  readonly occurredAt: string;
}

export interface SyncUpsertOperation<TPayload> extends SyncOperationBase {
  readonly kind: 'upsert';
  readonly payload: TPayload;
}

export interface SyncTombstoneOperation extends SyncOperationBase {
  readonly kind: 'tombstone';
  readonly payload: null;
}

export type SyncOperationInput<TPayload> =
  | (Omit<SyncUpsertOperation<TPayload>, 'id'> & { id: string })
  | (Omit<SyncTombstoneOperation, 'id'> & { id: string });

export interface SyncEntityRef {
  readonly type: SyncEntityType;
  readonly id: string;
}

export interface SyncVersion {
  readonly revision: number;
  readonly origin: SyncOrigin;
}

export interface SyncOrigin {
  readonly deviceId: string;
  readonly sequence: number;
}

export interface SyncCheckpoint {
  readonly cursor: string | null;
  readonly lastAppliedOperationId: string | null;
  readonly updatedAt: string;
}

export interface SyncPushRequest<TPayload> {
  readonly operations: readonly SyncOperation<TPayload>[];
  readonly checkpoint: SyncCheckpoint | null;
}

export interface SyncPushResult {
  readonly acknowledgedOperationIds: readonly string[];
  readonly checkpoint: SyncCheckpoint;
}

export interface SyncPullRequest {
  readonly checkpoint: SyncCheckpoint | null;
  readonly limit: number;
}

export interface SyncPullResult<TPayload> {
  readonly operations: readonly SyncOperation<TPayload>[];
  readonly checkpoint: SyncCheckpoint;
  readonly hasMore: boolean;
}

export interface SyncAdapter<TPayload> {
  push(request: SyncPushRequest<TPayload>): Promise<SyncPushResult>;
  pull(request: SyncPullRequest): Promise<SyncPullResult<TPayload>>;
}

export interface NoteSyncOutbox {
  getDeviceId(): string;
  recordNote(note: Note): SyncOperation<Note>;
  listPending(limit?: number): readonly SyncOperation<Note>[];
  acknowledge(operationIds: readonly string[]): void;
  getCheckpoint(targetId: string): SyncCheckpoint | null;
  setCheckpoint(targetId: string, checkpoint: SyncCheckpoint): void;
}

export class InvalidSyncContractError extends Error {
  constructor() {
    super('Invalid synchronization contract.');
    this.name = 'InvalidSyncContractError';
  }
}

export function createSyncOperation<TPayload>(
  input: SyncOperationInput<TPayload>,
): SyncOperation<TPayload> {
  assertStableIdentifier(input.id);
  assertStableIdentifier(input.entity.id);
  assertStableIdentifier(input.version.origin.deviceId);
  assertPositiveInteger(input.version.revision);
  assertNonNegativeInteger(input.version.origin.sequence);
  assertIsoTimestamp(input.occurredAt);

  const base: SyncOperationBase = {
    id: input.id,
    entity: { ...input.entity },
    version: {
      revision: input.version.revision,
      origin: { ...input.version.origin },
    },
    occurredAt: input.occurredAt,
  };

  if (input.kind === 'tombstone') {
    return { ...base, kind: 'tombstone', payload: null };
  }

  return { ...base, kind: 'upsert', payload: input.payload };
}

export function createSyncCheckpoint(input: SyncCheckpoint): SyncCheckpoint {
  if (input.cursor !== null) {
    assertCursor(input.cursor);
  }
  if (input.lastAppliedOperationId !== null) {
    assertStableIdentifier(input.lastAppliedOperationId);
  }
  assertIsoTimestamp(input.updatedAt);

  return { ...input };
}

export function createSyncPullRequest(input: SyncPullRequest): SyncPullRequest {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100
  ) {
    throw new InvalidSyncContractError();
  }

  return {
    checkpoint: input.checkpoint
      ? createSyncCheckpoint(input.checkpoint)
      : null,
    limit: input.limit,
  };
}

export function compareSyncVersions(
  left: SyncVersion,
  right: SyncVersion,
): -1 | 0 | 1 {
  const byRevision = compareNumber(left.revision, right.revision);
  if (byRevision !== 0) {
    return byRevision;
  }

  const byDeviceId = compareString(left.origin.deviceId, right.origin.deviceId);
  if (byDeviceId !== 0) {
    return byDeviceId;
  }

  return compareNumber(left.origin.sequence, right.origin.sequence);
}

function assertStableIdentifier(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new InvalidSyncContractError();
  }
}

function assertPositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InvalidSyncContractError();
  }
}

function assertNonNegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidSyncContractError();
  }
}

function assertIsoTimestamp(value: string): void {
  const hasTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!hasTimeZone || Number.isNaN(Date.parse(value))) {
    throw new InvalidSyncContractError();
  }
}

function assertCursor(value: string): void {
  if (value.length === 0 || value.length > 4_096) {
    throw new InvalidSyncContractError();
  }
}

function compareNumber(left: number, right: number): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function compareString(left: string, right: string): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
import type { Note } from './note';
