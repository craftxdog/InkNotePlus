import {
  createCipheriv,
  createDecipheriv,
  pbkdf2,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { z } from '../../shared/validation';

const derive = promisify(pbkdf2);
const defaultIterations = 600_000;
const checkText = 'inknote-encryption-check';
const checkId = 'inknote:encryption';

export const sealedSchema = z
  .object({
    v: z.literal(1),
    iv: z.string().max(32),
    tag: z.string().max(32),
    data: z.string(),
  })
  .strict();
export type Sealed = z.output<typeof sealedSchema>;
export const encryptionInfoSchema = z.object({
  algorithm: z.literal('AES-256-GCM'),
  kdf: z.literal('PBKDF2-SHA256'),
  salt: z.string().max(64),
  iterations: z.number().int().min(1000).max(10_000_000),
  check: sealedSchema,
});
export type EncryptionInfo = z.output<typeof encryptionInfoSchema>;

const deriveKey = (passphrase: string, salt: string, iterations: number) =>
  derive(
    passphrase.normalize('NFKC'),
    Buffer.from(salt, 'base64'),
    iterations,
    32,
    'sha256',
  );

function seal(key: Buffer, id: string, plain: Buffer): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  // The document id is authenticated, so the server cannot swap two documents.
  cipher.setAAD(Buffer.from(id));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function open(key: Buffer, id: string, sealed: Sealed) {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(sealed.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.data, 'base64')),
    decipher.final(),
  ]);
}

export const encryptDocument = (key: Buffer, id: string, value: unknown) =>
  seal(key, id, Buffer.from(JSON.stringify(value)));

export const decryptDocument = (key: Buffer, id: string, sealed: Sealed) =>
  JSON.parse(open(key, id, sealed).toString()) as unknown;

export async function createEncryptionInfo(
  passphrase: string,
  iterations = defaultIterations,
) {
  const salt = randomBytes(16).toString('base64');
  const key = await deriveKey(passphrase, salt, iterations);
  const info: EncryptionInfo = {
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    salt,
    iterations,
    check: seal(key, checkId, Buffer.from(checkText)),
  };
  return { info, key };
}

export async function unlockEncryption(
  passphrase: string,
  info: EncryptionInfo,
) {
  const key = await deriveKey(passphrase, info.salt, info.iterations);
  try {
    const plain = open(key, checkId, info.check);
    const expected = Buffer.from(checkText);
    return plain.length === expected.length && timingSafeEqual(plain, expected)
      ? key
      : null;
  } catch {
    return null;
  }
}
