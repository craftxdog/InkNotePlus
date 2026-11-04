import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const mimeTypes: Record<string, string> = {
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};
export async function readAsset(
  url: string,
  userData: string,
): Promise<Response> {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'inknote-asset:' ||
      !['themes', 'images'].includes(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.search ||
      parsed.hash
    )
      return new Response(null, { status: 404 });
    const parts = decodeURIComponent(parsed.pathname)
      .split('/')
      .filter(Boolean);
    if (
      !parts.length ||
      parts.some(
        (part) =>
          !/^[a-zA-Z0-9_.-]+$/.test(part) || part === '.' || part === '..',
      )
    )
      return new Response(null, { status: 404 });
    const mime = mimeTypes[path.extname(parts.at(-1)!)];
    if (!mime || (parsed.hostname === 'images' && !mime.startsWith('image/')))
      return new Response(null, { status: 404 });
    const base = await realpath(path.join(userData, parsed.hostname));
    const file = await realpath(path.join(base, ...parts));
    if (!file.startsWith(base + path.sep))
      return new Response(null, { status: 404 });
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > 5_000_000)
      return new Response(null, { status: 404 });
    return new Response(await readFile(file), {
      headers: {
        'Content-Type': mime,
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
