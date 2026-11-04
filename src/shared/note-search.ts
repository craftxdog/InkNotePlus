// Syntax documented at https://docs.inkdrop.app/reference/search-and-filter-notes.
export type SearchField = 'text' | 'book' | 'tag' | 'status' | 'title' | 'body';
export interface SearchTerm {
  field: SearchField;
  value: string;
  exclude: boolean;
}
const fields = new Set(['book', 'tag', 'status', 'title', 'body']);

export function parseNoteSearch(query: string): {
  terms: SearchTerm[];
  valid: boolean;
} {
  const terms: SearchTerm[] = [];
  let offset = 0;
  if (query.length > 512) return { terms, valid: false };
  while (offset < query.length) {
    while (/\s/u.test(query[offset] ?? '') && offset < query.length) offset++;
    if (offset === query.length) break;
    const exclude = query[offset] === '-';
    if (exclude) offset++;
    const qualifier = /^([a-z]+):/i.exec(query.slice(offset));
    let field: SearchField = 'text';
    if (qualifier && fields.has(qualifier[1].toLowerCase())) {
      field = qualifier[1].toLowerCase() as SearchField;
      offset += qualifier[0].length;
    }
    let value = '';
    if (query[offset] === '"') {
      offset++;
      let closed = false;
      while (offset < query.length) {
        const char = query[offset++];
        if (char === '"') {
          closed = true;
          break;
        }
        if (char === '\\' && /["\\]/.test(query[offset] ?? ''))
          value += query[offset++];
        else value += char;
      }
      if (!closed || (offset < query.length && !/\s/.test(query[offset])))
        return { terms, valid: false };
    } else {
      while (offset < query.length && !/\s/u.test(query[offset]))
        value += query[offset++];
    }
    if (!value || terms.length >= 32) return { terms, valid: false };
    terms.push({ field, value, exclude });
  }
  return { terms, valid: terms.some((term) => !term.exclude) };
}

export function searchHighlightTerms(query: string): string[] {
  return parseNoteSearch(query)
    .terms.filter(
      (term) => !term.exclude && ['text', 'title', 'body'].includes(term.field),
    )
    .map((term) => term.value);
}
