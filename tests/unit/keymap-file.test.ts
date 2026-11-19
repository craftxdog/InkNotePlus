import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseKeymap } from '../../src/shared/keymap-file';
import { createKeymapFile } from '../../src/main/keymap-file';

describe('parseKeymap', () => {
  it('reads selectors, sequences and special commands', () => {
    expect(
      parseKeymap(
        JSON.stringify({
          body: { 'Mod-k Mod-n': 'core:new-note', 'Mod-j': 'unset!' },
          '.cm-content': { 'Mod-b': 'native!', 'Mod-u': 'abort!' },
        }),
      ),
    ).toEqual({
      entries: [
        {
          selector: 'body',
          keystroke: 'Mod-k Mod-n',
          command: 'core:new-note',
        },
        { selector: 'body', keystroke: 'Mod-j', command: 'unset!' },
        { selector: '.cm-content', keystroke: 'Mod-b', command: 'native!' },
        { selector: '.cm-content', keystroke: 'Mod-u', command: 'abort!' },
      ],
      errors: [],
    });
  });

  it('accepts the former name of a command', () => {
    expect(
      parseKeymap('{"body":{"Mod-y":"core:focus-search"}}').entries[0].command,
    ).toBe('core:find');
  });

  it('keeps valid entries and reports each invalid one', () => {
    const result = parseKeymap(
      JSON.stringify({
        body: { 'Mod-y': 'core:new-note', 'Nope+k': 'core:new-note' },
        '.a': { 'Mod-u': 'no:existe', 'Mod-i': 5 },
      }),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.errors).toHaveLength(3);
  });

  it.each(['{mal', '[]', '"texto"'])('reports malformed file %s', (text) => {
    const result = parseKeymap(text);
    expect(result.entries).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});

describe('createKeymapFile', () => {
  const directories: string[] = [];
  const directory = () => {
    const value = mkdtempSync(path.join(tmpdir(), 'inknote-keymap-'));
    directories.push(value);
    return value;
  };
  afterEach(() => {
    vi.useRealTimers();
    for (const value of directories.splice(0))
      rmSync(value, { recursive: true, force: true });
  });

  it('treats a missing file as an empty keymap', () => {
    const file = createKeymapFile({ directory: directory(), onChange() {} });
    expect(file.read()).toMatchObject({ entries: [], errors: [] });
    file.dispose();
  });

  it('creates a starter file only when it does not exist', () => {
    const folder = directory();
    const file = createKeymapFile({ directory: folder, onChange() {} });
    const target = file.ensure();
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({});
    writeFileSync(target, '{"body":{"Mod-y":"core:new-note"}}');
    file.ensure();
    expect(file.read().entries).toHaveLength(1);
    file.dispose();
  });

  it('reports changes made to the file on disk', async () => {
    const folder = directory();
    const onChange = vi.fn();
    const file = createKeymapFile({ directory: folder, onChange, delay: 10 });
    file.start();
    // The system watcher can take a moment to start, so the write is repeated.
    await vi.waitFor(
      () => {
        writeFileSync(
          path.join(folder, 'keymap.json'),
          '{"body":{"Mod-y":"core:new-note"}}',
        );
        expect(onChange).toHaveBeenCalled();
      },
      { timeout: 5000, interval: 100 },
    );
    expect(onChange.mock.lastCall?.[0].entries).toHaveLength(1);
    file.dispose();
  });
});
