import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import {
  defaultPreferences,
  preferencesSchema,
} from '../../src/shared/preferences';
import { unwrappedBlocks } from '../../src/renderer/editor/line-wrapping';

const source =
  'Prose before.\n\n```js\nconst long = "value";\n```\n\n| One | Two |\n| --- | --- |\n| A | B |\n\nProse after.';
function stateAt(position: number) {
  const state = EditorState.create({
    doc: source,
    selection: { anchor: position },
    extensions: [markdown({ base: markdownLanguage })],
  });
  // This fixed fixture must parse completely, even when CI is CPU constrained.
  ensureSyntaxTree(state, source.length, Number.POSITIVE_INFINITY);
  return state;
}
it('preserves legacy wrap preferences and defaults new profiles to Inkdrop cursor wrapping', () => {
  expect(defaultPreferences.lineWrapping).toBe('cursor');
  expect(preferencesSchema.parse({ lineWrapping: true }).lineWrapping).toBe(
    'all',
  );
  expect(preferencesSchema.parse({ lineWrapping: false }).lineWrapping).toBe(
    'off',
  );
  for (const mode of ['off', 'all', 'prose', 'cursor'])
    expect(preferencesSchema.parse({ lineWrapping: mode }).lineWrapping).toBe(
      mode,
    );
  expect(
    preferencesSchema.safeParse({ lineWrapping: 'invented' }).success,
  ).toBe(false);
});
it('unwraps code and tables only in prose mode, never ordinary paragraphs', () => {
  const state = stateAt(0);
  expect(unwrappedBlocks(state, 'all')).toEqual([]);
  expect(unwrappedBlocks(state, 'off')).toEqual([]);
  expect(
    unwrappedBlocks(state, 'prose').map(({ from, to }) =>
      source.slice(from, to),
    ),
  ).toEqual([
    '```js\nconst long = "value";\n```',
    '| One | Two |\n| --- | --- |\n| A | B |',
  ]);
});
it('unwraps only the block at the cursor, including a fenced block with a code language', () => {
  expect(unwrappedBlocks(stateAt(0), 'cursor')).toEqual([]);
  const code = unwrappedBlocks(stateAt(source.indexOf('const')), 'cursor');
  expect(code).toHaveLength(1);
  expect(source.slice(code[0].from, code[0].to)).toContain('```js');
  const table = unwrappedBlocks(stateAt(source.indexOf('| A')), 'cursor');
  expect(table).toHaveLength(1);
  expect(source.slice(table[0].from, table[0].to)).toContain('| One |');
});
