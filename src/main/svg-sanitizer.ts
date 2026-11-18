import { SaxesParser } from 'saxes';

// Dropped with their content: active content, styling that can load resources
// and animations that can rewrite links after sanitizing.
const blockedElements = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'style',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'handler',
  'listener',
  'discard',
]);
const blockedAttributes = new Set(['src', 'base', 'xml:base']);
const safeRaster = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const localName = (name: string) => name.toLowerCase().split(':').at(-1)!;

function isSafeAttribute(name: string, value: string) {
  const lower = name.toLowerCase();
  const local = localName(name);
  if (
    local.startsWith('on') ||
    blockedAttributes.has(lower) ||
    /javascript:|vbscript:|@import|expression\(/i.test(value)
  )
    return false;
  if (local === 'href')
    return value.trim().startsWith('#') || safeRaster.test(value.trim());
  return [...value.matchAll(/url\(\s*(['"]?)([^)]*)/gi)].every(([, , target]) =>
    target.trim().startsWith('#'),
  );
}

function createParser() {
  const parser = new SaxesParser();
  parser.on('error', (error) => {
    throw error;
  });
  parser.on('doctype', (doctype) => {
    // An internal subset can define entities, the basis of expansion attacks.
    if (doctype.includes('[')) throw new Error('Invalid SVG document type.');
  });
  return parser;
}

// Rebuilds the document from an allowed subset instead of editing its text.
export function sanitizeSvg(bytes: Buffer) {
  const parser = createParser();
  const output: string[] = [];
  let skipped = 0;
  let root = false;
  parser.on('opentag', (tag) => {
    if (!root) {
      if (localName(tag.name) !== 'svg') throw new Error('Invalid SVG root.');
      root = true;
    }
    if (skipped || blockedElements.has(localName(tag.name))) {
      skipped++;
      return;
    }
    const attributes = Object.entries(tag.attributes)
      .filter(([name, value]) => isSafeAttribute(name, value))
      .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
      .join('');
    output.push(`<${tag.name}${attributes}>`);
  });
  parser.on('closetag', (tag) => {
    if (skipped) skipped--;
    else output.push(`</${tag.name}>`);
  });
  const text = (value: string) => {
    if (root && !skipped) output.push(escapeXml(value));
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.write(bytes.toString('utf8')).close();
  if (!root) throw new Error('Invalid SVG document.');
  return Buffer.from(output.join(''), 'utf8');
}

export function looksLikeSvg(bytes: Buffer) {
  return /^\s*(?:﻿)?(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<(?:[\w-]+:)?svg[\s/>]/i.test(
    bytes.subarray(0, 8192).toString('utf8'),
  );
}

const pixels = (value: string | undefined) => {
  const size = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/.exec(value ?? '');
  const number = size ? Number(size[1]) : 0;
  return number > 0 && number <= 16_384 ? Math.max(1, Math.round(number)) : 0;
};

export function svgDimensions(bytes: Buffer) {
  const parser = createParser();
  let attributes: Record<string, string> | undefined;
  parser.on('opentag', (tag) => {
    attributes ??= tag.attributes as Record<string, string>;
  });
  parser.write(bytes.toString('utf8')).close();
  const [, , boxWidth, boxHeight] = (attributes?.viewBox ?? '')
    .trim()
    .split(/[\s,]+/);
  return {
    width: pixels(attributes?.width) || pixels(boxWidth) || 300,
    height: pixels(attributes?.height) || pixels(boxHeight) || 150,
  };
}
