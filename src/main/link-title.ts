import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import {
  externalLinkSchema,
  maxLinkTitleLength,
} from '../shared/external-link';

const privateRanges = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  privateRanges.addSubnet(network, prefix, 'ipv4');
// Only global unicast IPv6, minus documentation and tunnels that embed IPv4.
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
const tunnelledIpv6 = new BlockList();
tunnelledIpv6.addSubnet('2001::', 32, 'ipv6');
tunnelledIpv6.addSubnet('2001:db8::', 32, 'ipv6');
tunnelledIpv6.addSubnet('2002::', 16, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (dotted) return isPublicAddress(dotted[1]);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return isPublicAddress(
      `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
    );
  }
  const family = isIP(address);
  if (family === 4) return !privateRanges.check(address, 'ipv4');
  return (
    family === 6 &&
    globalIpv6.check(address, 'ipv6') &&
    !tunnelledIpv6.check(address, 'ipv6')
  );
}

const namedEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  uuml: 'ü',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
  Uuml: 'Ü',
  iexcl: '¡',
  iquest: '¿',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
};

function decodeEntity(entity: string, name: string) {
  if (!name.startsWith('#')) return namedEntities[name] ?? entity;
  const code = /^#x/i.test(name)
    ? parseInt(name.slice(2), 16)
    : parseInt(name.slice(1), 10);
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : entity;
}

function cleanTitle(value: string) {
  const title = value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|[a-z][\da-z]*);/gi, decodeEntity)
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return title ? title.slice(0, maxLinkTitleLength) : null;
}

export function parsePageTitle(html: string) {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const cleaned = title && cleanTitle(title[1]);
  if (cleaned) return cleaned;
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\b(?:property|name)\s*=\s*["']og:title["']/i.test(tag)) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = content && cleanTitle(content[1] ?? content[2]);
    if (value) return value;
  }
  return null;
}

interface TitleOptions {
  allowAddress?: (address: string) => boolean;
  timeoutMs?: number;
  maxBytes?: number;
}
type PageResponse =
  | { kind: 'redirect'; location: string }
  | { kind: 'page'; body: Buffer; charset: string | undefined }
  | { kind: 'none' };

function requestPage(
  url: URL,
  allowAddress: (address: string) => boolean,
  signal: AbortSignal,
  maxBytes: number,
) {
  // Validate the address at connection time, so a hostname cannot resolve to a
  // public address during a check and to an internal one when connecting.
  const lookup = ((hostname, options, callback) => {
    dnsLookup(
      hostname,
      { all: true, family: options.family },
      (error, addresses: LookupAddress[]) => {
        if (error) return callback(error, '', 0);
        if (
          !addresses.length ||
          addresses.some(({ address }) => !allowAddress(address))
        )
          return callback(new Error('Blocked address.'), '', 0);
        if (options.all) return callback(null, addresses as never);
        callback(null, addresses[0].address, addresses[0].family);
      },
    );
  }) as LookupFunction;
  return new Promise<PageResponse>((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup,
        signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-encoding': 'identity',
          'user-agent': 'InkNote',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.destroy();
          resolve({ kind: 'redirect', location });
          return;
        }
        const type = response.headers['content-type'] ?? '';
        if (
          status < 200 ||
          status >= 300 ||
          !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(type)
        ) {
          response.destroy();
          resolve({ kind: 'none' });
          return;
        }
        const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1];
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => {
          response.destroy();
          resolve({
            kind: 'page',
            body: Buffer.concat(chunks).subarray(0, maxBytes),
            charset,
          });
        };
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.length;
          if (
            size >= maxBytes ||
            /<\/(?:title|head)\s*>/i.test(chunk.toString('latin1'))
          )
            finish();
        });
        response.on('end', finish);
        response.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end();
  });
}

function decodeBody(body: Buffer, charset: string | undefined) {
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}

// Runs only after the user allows it. The request carries no cookies, referrer
// or note content, and any failure simply leaves the pasted URL as it is.
export async function fetchPageTitle(
  initial: string,
  {
    allowAddress = isPublicAddress,
    timeoutMs = 5000,
    maxBytes = 256 * 1024,
  }: TitleOptions = {},
) {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    let target = initial;
    for (let hop = 0; hop < 4; hop++) {
      const parsed = externalLinkSchema.safeParse({ url: target });
      if (!parsed.success) return null;
      const url = new URL(parsed.data.url);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      if (isIP(host) && !allowAddress(host)) return null;
      const page = await requestPage(url, allowAddress, signal, maxBytes);
      if (page.kind === 'none') return null;
      if (page.kind === 'page')
        return parsePageTitle(decodeBody(page.body, page.charset));
      target = new URL(page.location, url).href;
    }
    return null;
  } catch {
    return null;
  }
}
