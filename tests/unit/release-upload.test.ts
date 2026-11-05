import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { uploadGithubAsset } from '../../scripts/lib/github-release.mjs';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

it('streams an installer to the numeric draft ID without looking up the tag', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'inknote-upload-'));
  directories.push(directory);
  const filename = path.join(directory, 'installer.exe');
  await writeFile(filename, 'binary fixture');
  const result = await uploadGithubAsset(
    'craftxdog/InkNotePlus',
    123,
    filename,
    { name: 'InkNote-1.0.1-windows.exe', size: 14 },
    'test-token',
    async (url, options) => {
      expect(String(url)).toBe(
        'https://uploads.github.com/repos/craftxdog/InkNotePlus/releases/123/assets?name=InkNote-1.0.1-windows.exe',
      );
      expect(options?.method).toBe('POST');
      expect(options?.headers).toMatchObject({
        Authorization: 'Bearer test-token',
        'Content-Length': '14',
      });
      expect(await (options?.body as Blob).text()).toBe('binary fixture');
      return new Response(
        JSON.stringify({ id: 456, name: 'InkNote-1.0.1-windows.exe' }),
        { status: 201 },
      );
    },
  );
  expect(result.id).toBe(456);
});

it('rejects upload failures without exposing the token', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'inknote-upload-'));
  directories.push(directory);
  const filename = path.join(directory, 'installer.exe');
  await writeFile(filename, 'x');
  await expect(
    uploadGithubAsset(
      'craftxdog/InkNotePlus',
      123,
      filename,
      { name: 'installer.exe', size: 1 },
      'secret-token',
      async () => new Response('', { status: 403 }),
    ),
  ).rejects.toThrow('GitHub upload failed (403): installer.exe');
});
