import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { inspectImage } from './image-store';

export const imageFileName = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;

export function digest(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readRegularFile(
  file: string,
  maxSize: number,
): Promise<Buffer> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > maxSize)
    throw new Error('Invalid transfer file.');
  const handle = await open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxSize)
      throw new Error('Invalid transfer file.');
    const bytes = await handle.readFile();
    if (bytes.length > maxSize) throw new Error('Transfer file is too large.');
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function readManagedImage(
  directory: string,
  name: string,
): Promise<Buffer> {
  if (!imageFileName.test(name)) throw new Error('Invalid attachment name.');
  const bytes = await readRegularFile(path.join(directory, name), 5_000_000);
  if (`${digest(bytes)}.${inspectImage(bytes).extension}` !== name)
    throw new Error('Attachment content does not match its name.');
  return bytes;
}

export function readAvailableImage(
  directory: string,
  name: string,
): Promise<Buffer | undefined> {
  return readManagedImage(directory, name).catch(() => undefined);
}

export async function writeAtomic(
  file: string,
  bytes: string | Uint8Array,
): Promise<void> {
  const temp = path.join(path.dirname(file), `.inknote-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o600, flush: true });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function requireDirectory(directory: string): Promise<void> {
  if (!(await lstat(directory)).isDirectory())
    throw new Error('Invalid transfer directory.');
}

export async function makeUniqueDirectory(
  parent: string,
  name: string,
): Promise<string> {
  const directory = path.join(parent, name);
  try {
    await mkdir(directory, { mode: 0o700 });
    return directory;
  } catch (error) {
    if (!hasFileError(error, 'EEXIST')) throw error;
    return mkdtemp(path.join(parent, `${name}-`));
  }
}

export function hasFileError(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === code
  );
}
