export type PaletteSource = 'commands' | 'books' | 'tags' | 'toc' | 'themes';

const prefixes: Record<string, PaletteSource> = {
  '>': 'commands',
  '#': 'toc',
  b: 'books',
  t: 'tags',
  h: 'themes',
};

// Letters need a following space so ordinary words still search every source.
// https://docs.inkdrop.app/reference/fuzzy-finder-telescope
export function parsePaletteQuery(query: string): {
  source: PaletteSource | null;
  search: string;
  prefix: string;
} {
  const match = /^(?:([>#])\s*|([bth])\s+)/.exec(query);
  if (!match) return { source: null, search: query, prefix: '' };
  return {
    source: prefixes[match[1] ?? match[2]],
    search: query.slice(match[0].length),
    prefix: match[0],
  };
}
