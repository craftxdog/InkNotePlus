import { expect, it } from 'vitest';
import { splitMarkdownBlocks } from '../../src/renderer/editor/markdown-blocks';

const texts = (source: string) =>
  splitMarkdownBlocks(source).map((block) => block.text);

it('splits top-level blocks at blank lines and keeps their source positions', () => {
  const source = '# Title\n\nFirst paragraph\nstill first\n\n\nSecond';
  const blocks = splitMarkdownBlocks(source);
  expect(blocks.map((block) => block.text).join('')).toBe(source);
  expect(blocks).toEqual([
    { text: '# Title\n\n', line: 1, offset: 0 },
    { text: 'First paragraph\nstill first\n\n\n', line: 3, offset: 9 },
    { text: 'Second', line: 7, offset: 39 },
  ]);
});

it('keeps fenced code and display math whole, even with blank lines inside', () => {
  const source = [
    '```ts',
    'const a = 1;',
    '',
    'const b = 2;',
    '```',
    '',
    '~~~~',
    '```',
    '',
    'not closed by a shorter fence',
    '~~~~',
    '',
    '$$',
    'a = b',
    '',
    'c = d',
    '$$',
    '',
    'After',
  ].join('\n');
  expect(texts(source)).toEqual([
    '```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n',
    '~~~~\n```\n\nnot closed by a shorter fence\n~~~~\n\n',
    '$$\na = b\n\nc = d\n$$\n\n',
    'After',
  ]);
});

it('keeps a loose list and indented continuations in one block', () => {
  const source = '- one\n\n- two\n\n  more two\n\n1. next\n\nText';
  expect(texts(source)).toEqual([
    '- one\n\n- two\n\n  more two\n\n1. next\n\n',
    'Text',
  ]);
  expect(texts('Intro\n- a\nlazy\n\n- b\n\nEnd')).toEqual([
    'Intro\n- a\nlazy\n\n- b\n\n',
    'End',
  ]);
});

it('renders the whole note as one block when it has reference definitions', () => {
  for (const source of [
    'See [docs][1].\n\nMore\n\n[1]: https://example.com',
    'A note[^a].\n\nMore\n\n[^a]: The footnote.',
  ])
    expect(texts(source)).toEqual([source]);
});

it('keeps exact offsets with CRLF line endings', () => {
  const source = 'One\r\n\r\nTwo\r\n';
  expect(splitMarkdownBlocks(source)).toEqual([
    { text: 'One\r\n\r\n', line: 1, offset: 0 },
    { text: 'Two\r\n', line: 3, offset: 7 },
  ]);
});
