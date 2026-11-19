import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { appleNotesScript, readAppleNotes } from '../../src/main/apple-notes';
import { readAppleNotesSources } from '../../src/main/note-import';

const entry = {
  folders: ['iCloud', 'Trabajo'],
  title: 'Reunión',
  html: '<div><h1>Reunión</h1></div><div>Temas <b>clave</b></div>',
  createdAt: '2026-01-02T03:04:05.000Z',
  updatedAt: '2026-02-03T04:05:06.000Z',
};
const storeImage = vi.fn(async () => 'inknote-asset://images/a.png');

describe('readAppleNotes', () => {
  it('runs one read-only script through osascript', async () => {
    const run = vi.fn(async () =>
      JSON.stringify({ notes: [entry], locked: 2 }),
    );
    const result = await readAppleNotes(run);
    expect(run).toHaveBeenCalledWith('osascript', [
      '-l',
      'JavaScript',
      '-e',
      appleNotesScript,
    ]);
    expect(result).toEqual({ notes: [entry], locked: 2 });
  });

  it('never changes or removes anything in Notes', () => {
    expect(appleNotesScript).not.toMatch(
      /\.delete\(|\.make\(|\.save\(|\.move\(|\.body\s*=/,
    );
  });

  it('leaves password-protected notes out', () => {
    expect(appleNotesScript).toContain('passwordProtected()');
  });

  it('reports a denied permission', async () => {
    await expect(
      readAppleNotes(async () => {
        throw new Error(
          'Not authorized to send Apple events to Notes. (-1743)',
        );
      }),
    ).rejects.toMatchObject({ code: 'permission' });
  });

  it('rejects an unexpected answer', async () => {
    await expect(readAppleNotes(async () => '{"notes":5}')).rejects.toThrow();
  });

  it.skipIf(process.platform !== 'darwin')('compiles without running', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'inknote-jxa-'));
    try {
      execFileSync('osacompile', [
        '-l',
        'JavaScript',
        '-o',
        path.join(folder, 'a.scpt'),
        '-e',
        appleNotesScript,
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('readAppleNotesSources', () => {
  it('converts notes to Markdown and keeps folders and dates', async () => {
    const { notes } = await readAppleNotesSources([entry], { storeImage });
    expect(notes[0]).toMatchObject({
      title: 'Reunión',
      folders: ['Apple Notes', 'iCloud', 'Trabajo'],
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
    expect(notes[0].body).toContain('**clave**');
    expect(notes[0].body).not.toContain('Reunión');
  });

  it('removes a first line that repeats the title', async () => {
    const { notes } = await readAppleNotesSources(
      [{ ...entry, html: '<div>Reunión</div><div>Resto</div>' }],
      { storeImage },
    );
    expect(notes[0].body.trim()).toBe('Resto');
  });

  it('stores embedded images', async () => {
    const data = Buffer.from('imagen').toString('base64');
    const { notes, images } = await readAppleNotesSources(
      [
        {
          ...entry,
          html: `<div><img src="data:image/png;base64,${data}"></div>`,
        },
      ],
      { storeImage },
    );
    expect(images).toBe(1);
    expect(notes[0].body).toContain('inknote-asset://images/a.png');
  });

  it('gives an untitled note a name', async () => {
    const { notes } = await readAppleNotesSources(
      [{ ...entry, title: '', html: '<div>Solo texto</div>' }],
      { storeImage },
    );
    expect(notes[0].title).toBe('Nota de Apple Notes');
  });
});
