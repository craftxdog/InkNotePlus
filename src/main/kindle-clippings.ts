export const isKindleClippings = (fileName: string, text: string) =>
  /^(my clippings|mis recortes)\.txt$/i.test(fileName) &&
  /^={10}\s*$/m.test(text);

const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

// Kindle appends every clipping to one file, separated by a line of equals signs.
export function parseKindleClippings(source: string) {
  const books = new Map<string, { author?: string; items: Set<string> }>();
  const clippings = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (const clipping of clippings.split(/^={10}\s*$/m)) {
    const lines = clipping.replace(/^﻿?\n*/, '').split('\n');
    const [heading, details] = lines;
    const text = lines.slice(2).join('\n').trim();
    if (!heading?.trim() || !details?.startsWith('- ') || !text) continue;
    const parts = /^(.*\S)\s+\(([^()]+)\)\s*$/.exec(heading.trim());
    const title = parts?.[1] ?? heading.trim();
    const book = books.get(title) ?? { author: parts?.[2], items: new Set() };
    books.set(title, book);
    book.items.add(
      /\b(note|nota)\b/i.test(details) ? `**Nota:** ${text}` : quote(text),
    );
  }
  return [...books].map(([title, { author, items }]) => ({
    title,
    body: `${author ? `*${author}*\n\n` : ''}${[...items].join('\n\n')}\n`,
  }));
}
