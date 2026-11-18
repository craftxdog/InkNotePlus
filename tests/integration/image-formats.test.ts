import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectImage, storeImage } from '../../src/main/image-store';
import { readAsset } from '../../src/main/asset-protocol';
import { readManagedImage } from '../../src/main/transfer-files';
import {
  imageWriteSchema,
  importableImageType,
  managedImageUrlPattern,
  maxImageBytes,
} from '../../src/shared/images';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'inknote-images-'));
});
afterEach(() => rm(directory, { recursive: true, force: true }));
const heic = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypheic'),
  Buffer.alloc(40),
]);
const png = () => {
  const bytes = Buffer.alloc(64);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(4, 16);
  bytes.writeUInt32BE(3, 20);
  return bytes;
};

describe('image limits and formats', () => {
  it('matches the documented 10 MB attachment limit', () => {
    expect(maxImageBytes).toBe(10_485_760);
    const big = png();
    const padded = Buffer.concat([
      big,
      Buffer.alloc(maxImageBytes - big.length),
    ]);
    expect(inspectImage(padded).extension).toBe('png');
    expect(() =>
      inspectImage(Buffer.concat([padded, Buffer.alloc(1)])),
    ).toThrow();
    expect(
      imageWriteSchema.safeParse({ base64: 'A'.repeat(13_981_016) }).success,
    ).toBe(true);
  });
  it.each([
    ['image/png', true],
    ['image/jpeg', true],
    ['image/gif', true],
    ['image/webp', true],
    ['image/svg+xml', true],
    ['image/heic', true],
    ['image/heif', true],
    ['image/tiff', false],
  ])('accepts %s from the editor: %s', (type, accepted) => {
    expect(importableImageType.test(type)).toBe(accepted);
  });
});

describe('storing SVG', () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6" onload="alert(1)"><script>alert(2)</script><rect width="8" height="6"/></svg>',
  );
  it('saves the sanitized file and serves it as an image', async () => {
    const isDecodable = vi.fn(() => false);
    const image = await storeImage(svg, directory, isDecodable);
    expect(image).toMatchObject({ width: 8, height: 6 });
    expect(image.url).toMatch(managedImageUrlPattern);
    const name = image.url.slice(image.url.lastIndexOf('/') + 1);
    const stored = await readFile(path.join(directory, 'images', name), 'utf8');
    expect(stored).not.toContain('alert');
    await expect(
      readManagedImage(path.join(directory, 'images'), name),
    ).resolves.toBeTruthy();
    const response = await readAsset(image.url, directory);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
  });
});

describe('storing HEIC', () => {
  it('stores the converted image', async () => {
    const converted = png();
    const convert = vi.fn(async () => converted);
    const image = await storeImage(heic, directory, () => true, convert);
    expect(convert).toHaveBeenCalledWith(heic);
    expect(image.url.endsWith('.png')).toBe(true);
  });
  it('rejects HEIC when this system cannot convert it', async () => {
    await expect(
      storeImage(
        heic,
        directory,
        () => true,
        async () => null,
      ),
    ).rejects.toThrow();
  });
});
