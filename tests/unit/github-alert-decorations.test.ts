import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { alertBlocks } from '../../src/renderer/editor/github-alert-decorations';

function stateFor(source: string) {
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ base: markdownLanguage })],
  });
  ensureSyntaxTree(state, source.length, Number.POSITIVE_INFINITY);
  return state.update({}).state;
}

it('recognizes top-level alert ranges and stops at the following paragraph', () => {
  const source = '> [!CAUTION]\n> First\n> second\n\nAfter\n\n   > [!NOTE]';
  const state = stateFor(source);
  const blocks = alertBlocks(state);
  expect(
    blocks.map((block) => [
      block.type,
      state.doc.lineAt(block.from).number,
      state.doc.lineAt(block.to - 1).number,
    ]),
  ).toEqual([
    ['caution', 1, 3],
    ['note', 7, 7],
  ]);
  expect(
    alertBlocks(state, source.indexOf('second'), source.indexOf('second') + 6),
  ).toHaveLength(1);
});

it('does not style code, escaped markers, nested alerts or markers with inline content', () => {
  const source =
    '```md\n> [!NOTE]\n```\n\n> > [!TIP]\n\n> \\[!NOTE]\n\n- item\n  > [!IMPORTANT]\n\n> [!CAUTION] inline\n\n> [!UNKNOWN]\n\n>\n> [!NOTE]\n> Body';
  expect(alertBlocks(stateFor(source))).toEqual([]);
});
