import type { CouchClient } from './couch-client';
import {
  createEncryptionInfo,
  encryptionInfoSchema,
  unlockEncryption,
} from './crypto';
import { SyncError } from './errors';

const infoId = 'inknote:encryption';

// The first device creates the shared record, and later ones must match it.
export async function connectEncryption(
  client: CouchClient,
  passphrase: string,
  iterations?: number,
) {
  await client.ensureDatabase();
  for (let attempt = 0; attempt < 2; attempt++) {
    const stored = await client.get(infoId);
    if (stored) {
      const info = encryptionInfoSchema.safeParse(stored);
      if (!info.success) throw new SyncError('wrong_passphrase');
      const key = await unlockEncryption(passphrase, info.data);
      if (!key) throw new SyncError('wrong_passphrase');
      return { key, created: false };
    }
    const fresh = await createEncryptionInfo(passphrase, iterations);
    if (await client.put(infoId, fresh.info))
      return { key: fresh.key, created: true };
  }
  throw new SyncError('server');
}
