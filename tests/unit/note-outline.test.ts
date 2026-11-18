import { describe, expect, it } from 'vitest';
import {
  activeOutlineIndex,
  noteOutline,
} from '../../src/renderer/editor/note-outline';
import { parsePaletteQuery } from '../../src/renderer/palette/palette-query';

describe('note outline', () => {
  it('lists headings and tasks in document order with their lines', () => {
    const body = [
      '# Título **fuerte**',
      '',
      '- [ ] Pendiente `código`',
      '- [x] Hecha',
      '- normal',
      '',
      'Sección',
      '---',
      '',
      '### [Enlace](https://example.com) ###',
    ].join('\n');
    expect(noteOutline(body)).toEqual([
      { kind: 'heading', level: 1, text: 'Título fuerte', line: 1 },
      {
        kind: 'task',
        level: 0,
        text: 'Pendiente código',
        line: 3,
        checked: false,
      },
      { kind: 'task', level: 0, text: 'Hecha', line: 4, checked: true },
      { kind: 'heading', level: 2, text: 'Sección', line: 7 },
      { kind: 'heading', level: 3, text: 'Enlace', line: 10 },
    ]);
  });
  it('ignores headings and tasks inside code blocks', () => {
    expect(
      noteOutline('```md\n# No\n- [ ] No\n```\n\n    # Tampoco\n'),
    ).toEqual([]);
  });
  it('counts lines correctly with Windows line endings', () => {
    expect(noteOutline('uno\r\n\r\n## Dos\r\n')[0].line).toBe(3);
  });
  it('names an empty heading so it stays selectable', () => {
    expect(noteOutline('##\n')[0].text).toBe('Sin título');
  });
  it('finds the section that contains a line', () => {
    const items = noteOutline('intro\n\n# A\n\ntexto\n\n# B\n');
    expect(activeOutlineIndex(items, 1)).toBe(-1);
    expect(activeOutlineIndex(items, 3)).toBe(0);
    expect(activeOutlineIndex(items, 6)).toBe(0);
    expect(activeOutlineIndex(items, 7)).toBe(1);
  });
});

describe('palette query', () => {
  it.each([
    ['> nueva', 'commands', 'nueva'],
    ['>nueva', 'commands', 'nueva'],
    ['b Trabajo', 'books', 'Trabajo'],
    ['t  alfa', 'tags', 'alfa'],
    ['# Intro', 'toc', 'Intro'],
    ['#', 'toc', ''],
    ['h kanagawa', 'themes', 'kanagawa'],
    ['b ', 'books', ''],
  ])('scopes %j to a source', (query, source, search) => {
    expect(parsePaletteQuery(query)).toEqual({
      source,
      search,
      prefix: query.slice(0, query.length - search.length),
    });
  });
  it.each(['', 'b', 'beta', 'trabajo', 'h1 algo'])(
    'searches every source for %j',
    (query) => {
      expect(parsePaletteQuery(query)).toEqual({
        source: null,
        search: query,
        prefix: '',
      });
    },
  );
});
