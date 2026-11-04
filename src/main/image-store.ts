import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ManagedImage } from '../shared/images';

export function inspectImage(bytes: Buffer): {
  extension: string;
  width: number;
  height: number;
} {
  let extension = '',
    width = 0,
    height = 0;
  if (bytes.length > 5_000_000 || bytes.length < 24)
    throw new Error('Invalid image.');
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    extension = 'png';
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (/^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) {
    extension = 'gif';
    width = bytes.readUInt16LE(6);
    height = bytes.readUInt16LE(8);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    extension = 'jpg';
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (
        [0xd8, 0xd9, 0x01].includes(marker) ||
        (marker >= 0xd0 && marker <= 0xd7)
      )
        continue;
      if (offset + 7 > bytes.length) break;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += size;
    }
  } else if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    extension = 'webp';
    const type = bytes.toString('ascii', 12, 16);
    if (type === 'VP8X' && bytes.length >= 30) {
      width = 1 + bytes.readUIntLE(24, 3);
      height = 1 + bytes.readUIntLE(27, 3);
    } else if (type === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const dimensions = bytes.readUInt32LE(21);
      width = (dimensions & 0x3fff) + 1;
      height = ((dimensions >>> 14) & 0x3fff) + 1;
    } else if (
      type === 'VP8 ' &&
      bytes.length >= 30 &&
      bytes.subarray(23, 26).equals(Buffer.from([0x9d, 1, 0x2a]))
    ) {
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
    }
  }
  if (
    !extension ||
    !width ||
    !height ||
    width > 16_384 ||
    height > 16_384 ||
    width * height > 16_000_000
  )
    throw new Error('Invalid image dimensions.');
  return { extension, width, height };
}
export async function storeImage(
  bytes: Buffer,
  userData: string,
  isDecodable: (bytes: Buffer) => boolean,
): Promise<ManagedImage> {
  const { extension, width, height } = inspectImage(bytes);
  if (!isDecodable(bytes)) throw new Error('Invalid image.');
  const name = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
  const directory = path.join(userData, 'images');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), bytes);
  return { url: `inknote-asset://images/${name}`, width, height };
}
