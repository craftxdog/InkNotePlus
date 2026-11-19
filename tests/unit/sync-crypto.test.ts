import { describe, expect, it } from 'vitest';
import {
  createEncryptionInfo,
  decryptDocument,
  encryptDocument,
  unlockEncryption,
} from '../../src/main/sync/crypto';
import { maxSyncFileBytes } from '../../src/infrastructure/sqlite/sqlite-sync-store';

const iterations = 1000;

describe('sync encryption', () => {
  it('round-trips a document', async () => {
    const { key } = await createEncryptionInfo('frase', iterations);
    const sealed = encryptDocument(key, 'note:1', { title: 'Secreto' });
    expect(JSON.stringify(sealed)).not.toContain('Secreto');
    expect(decryptDocument(key, 'note:1', sealed)).toEqual({
      title: 'Secreto',
    });
  });

  it('uses a new nonce for every write', async () => {
    const { key } = await createEncryptionInfo('frase', iterations);
    const a = encryptDocument(key, 'note:1', { a: 1 });
    const b = encryptDocument(key, 'note:1', { a: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('rejects content moved to another document', async () => {
    const { key } = await createEncryptionInfo('frase', iterations);
    const sealed = encryptDocument(key, 'note:1', { a: 1 });
    expect(() => decryptDocument(key, 'note:2', sealed)).toThrow();
  });

  it('rejects tampered content', async () => {
    const { key } = await createEncryptionInfo('frase', iterations);
    const sealed = encryptDocument(key, 'note:1', { a: 1 });
    const data = Buffer.from(sealed.data, 'base64');
    data[0] ^= 1;
    expect(() =>
      decryptDocument(key, 'note:1', {
        ...sealed,
        data: data.toString('base64'),
      }),
    ).toThrow();
  });

  it('unlocks with the right passphrase only', async () => {
    const { info, key } = await createEncryptionInfo('frase', iterations);
    expect((await unlockEncryption('frase', info))?.equals(key)).toBe(true);
    expect(await unlockEncryption('otra', info)).toBeNull();
  });

  it('never stores the passphrase or key in the shared record', async () => {
    const { info, key } = await createEncryptionInfo('frase-unica', iterations);
    const text = JSON.stringify(info);
    expect(text).not.toContain('frase-unica');
    expect(text).not.toContain(key.toString('base64'));
  });

  // CouchDB rejects documents over 8 MB by default, and images are encoded twice.
  it('fits the largest synced image in one CouchDB document', async () => {
    const { key } = await createEncryptionInfo('frase', iterations);
    const name = `${'a'.repeat(64)}.png`;
    const doc = {
      _id: `file:${name}`,
      _rev: '1-'.padEnd(34, 'f'),
      docType: 'file',
      sealed: encryptDocument(key, `file:${name}`, {
        type: 'file',
        name,
        data: Buffer.alloc(maxSyncFileBytes, 1).toString('base64'),
      }),
    };
    expect(JSON.stringify(doc).length).toBeLessThan(8_000_000);
  });

  it('requires a strong iteration count by default', async () => {
    const { info } = await createEncryptionInfo('frase');
    expect(info.iterations).toBeGreaterThanOrEqual(600_000);
  }, 20_000);
});
