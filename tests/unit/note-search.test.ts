import { describe, expect, it } from 'vitest';
import { parseNoteSearch } from '../../src/shared/note-search';

describe('documented Inkdrop search syntax', () => {
  it('parses quoted phrases, qualifiers and exclusions without exposing raw FTS operators', () => {
    expect(
      parseNoteSearch(
        '"closure functions" book:"Team notes" tag:work -status:completed -body:"do not match"',
      ).terms,
    ).toEqual([
      { field: 'text', value: 'closure functions', exclude: false },
      { field: 'book', value: 'Team notes', exclude: false },
      { field: 'tag', value: 'work', exclude: false },
      { field: 'status', value: 'completed', exclude: true },
      { field: 'body', value: 'do not match', exclude: true },
    ]);
  });
  it('requires an inclusion, bounds complexity and reports incomplete phrases', () => {
    expect(parseNoteSearch('-book:Backend').valid).toBe(false);
    expect(parseNoteSearch('title:"unclosed').valid).toBe(false);
    expect(parseNoteSearch('tag:work').valid).toBe(true);
    expect(parseNoteSearch('tag:work '.repeat(40)).valid).toBe(false);
  });
});
