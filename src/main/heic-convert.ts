import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Chromium cannot display HEIC, so it is stored as JPEG. Only macOS includes a
// system converter; other platforms report the image as unsupported.
export async function convertHeicToJpeg(bytes: Buffer) {
  if (process.platform !== 'darwin') return null;
  const directory = await mkdtemp(path.join(tmpdir(), 'inknote-heic-'));
  try {
    const input = path.join(directory, 'input.heic');
    const output = path.join(directory, 'output.jpg');
    await writeFile(input, bytes, { mode: 0o600 });
    await run(
      '/usr/bin/sips',
      ['-s', 'format', 'jpeg', input, '--out', output],
      { timeout: 20_000 },
    );
    return await readFile(output);
  } catch {
    return null;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
