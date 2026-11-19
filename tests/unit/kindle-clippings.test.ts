import { describe, expect, it } from 'vitest';
import {
  isKindleClippings,
  parseKindleClippings,
} from '../../src/main/kindle-clippings';

const entry = (book: string, meta: string, text: string) =>
  `${book}\r\n- ${meta}\r\n\r\n${text}\r\n==========\r\n`;
const highlight =
  'Your Highlight on page 12 | Location 100-102 | Added on Monday, March 2, 2026 8:00:00 AM';

describe('parseKindleClippings', () => {
  it('groups highlights by book', () => {
    const notes = parseKindleClippings(
      '﻿' +
        entry('Dune (Frank Herbert)', highlight, 'El miedo mata la mente.') +
        entry('Otro libro (Ana Ruiz)', highlight, 'Una idea.') +
        entry('Dune (Frank Herbert)', highlight, 'Segunda cita.'),
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]).toEqual({
      title: 'Dune',
      body: '*Frank Herbert*\n\n> El miedo mata la mente.\n\n> Segunda cita.\n',
    });
  });

  it('keeps parentheses that belong to the title', () => {
    const [note] = parseKindleClippings(
      entry('Libro (edición 2) (Ana Ruiz)', highlight, 'Texto'),
    );
    expect(note.title).toBe('Libro (edición 2)');
    expect(note.body).toContain('*Ana Ruiz*');
  });

  it('accepts a book without an author', () => {
    const [note] = parseKindleClippings(entry('Sin autor', highlight, 'Texto'));
    expect(note).toEqual({ title: 'Sin autor', body: '> Texto\n' });
  });

  it('marks personal notes and skips bookmarks', () => {
    const [note] = parseKindleClippings(
      entry(
        'Libro (A)',
        'Your Note on page 3 | Added on Monday',
        'Mi opinión',
      ) + entry('Libro (A)', 'Your Bookmark on page 4 | Added on Monday', ''),
    );
    expect(note.body).toBe('*A*\n\n**Nota:** Mi opinión\n');
  });

  it('understands Spanish devices', () => {
    const [note] = parseKindleClippings(
      entry(
        'Libro (A)',
        'Tu nota en la página 3 | Añadido el lunes',
        'Opinión',
      ),
    );
    expect(note.body).toContain('**Nota:** Opinión');
  });

  it('removes repeated highlights', () => {
    const [note] = parseKindleClippings(
      entry('Libro (A)', highlight, 'Igual') +
        entry('Libro (A)', highlight, 'Igual'),
    );
    expect(note.body.match(/Igual/g)).toHaveLength(1);
  });

  it('quotes every line of a multi-line highlight', () => {
    const [note] = parseKindleClippings(
      entry('Libro (A)', highlight, 'Uno\r\nDos'),
    );
    expect(note.body).toContain('> Uno\n> Dos\n');
  });
});

describe('isKindleClippings', () => {
  const text = entry('Libro (A)', highlight, 'Texto');
  it.each(['My Clippings.txt', 'my clippings.TXT', 'Mis recortes.txt'])(
    'detects %s',
    (name) => expect(isKindleClippings(name, text)).toBe(true),
  );
  it('ignores other text files', () => {
    expect(isKindleClippings('notas.txt', text)).toBe(false);
    expect(isKindleClippings('My Clippings.txt', 'texto normal')).toBe(false);
  });
});
