export type SyncErrorCode =
  | 'bad_address'
  | 'unreachable'
  | 'unauthorized'
  | 'forbidden'
  | 'server'
  | 'wrong_passphrase'
  | 'mass_delete';

export class SyncError extends Error {
  constructor(readonly code: SyncErrorCode) {
    super(code);
  }
}
