import { javascriptLanguage } from '@codemirror/lang-javascript';
import { highlightTree, tags } from '@lezer/highlight';
import { expect, it } from 'vitest';
import { tokenHighlighter } from '../../src/renderer/editor/token-highlighter';

it.each([
  [tags.lineComment, 'tok-line-comment'],
  [tags.controlKeyword, 'tok-control-keyword'],
  [tags.moduleKeyword, 'tok-module-keyword'],
  [tags.typeName, 'tok-class-name'],
  [tags.escape, 'tok-string tok-special'],
  [tags.docString, 'tok-string'],
  [tags.inserted, 'tok-inserted'],
  [tags.deleted, 'tok-deleted'],
  [tags.changed, 'tok-changed'],
  [tags.heading3, 'tok-heading tok-heading-3'],
  [tags.monospace, 'tok-monospace md-inline-code'],
])(
  'maps grammar semantics to the public theme vocabulary: %s',
  (tag, classes) => {
    expect(tokenHighlighter.style([tag])).toBe(classes);
  },
);

it('preserves function and definition modifiers from the parser', () => {
  const source =
    '// explanation\nfunction greet(name) { return name; }\ngreet("Hi");';
  const tokens: { text: string; classes: string }[] = [];
  highlightTree(
    javascriptLanguage.parser.parse(source),
    tokenHighlighter,
    (from, to, classes) => {
      tokens.push({ text: source.slice(from, to), classes });
    },
  );
  expect(tokens).toContainEqual({
    text: '// explanation',
    classes: 'tok-line-comment',
  });
  expect(tokens).toContainEqual({
    text: 'return',
    classes: 'tok-control-keyword',
  });
  const functions = tokens.filter(({ text }) => text === 'greet');
  expect(functions).toHaveLength(2);
  expect(functions[0].classes.split(' ')).toEqual(
    expect.arrayContaining([
      'tok-variable-name',
      'tok-definition',
      'tok-function',
    ]),
  );
  expect(functions[1].classes.split(' ')).toEqual(
    expect.arrayContaining(['tok-variable-name', 'tok-function']),
  );
});
