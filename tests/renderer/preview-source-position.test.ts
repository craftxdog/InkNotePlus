// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { sourceTextOffsets } from '../../src/renderer/editor/preview-source-position';

it('maps decoded Markdown text back to escaped source and named or numeric entities', () => {
  const source = String.raw`a\* &amp; &#x1F642; z`;
  const text = 'a* & 🙂 z';
  const offsets = sourceTextOffsets(source, text, document);
  expect(offsets).toHaveLength(text.length + 1);
  expect(offsets[text.indexOf('*')]).toBe(source.indexOf('\\'));
  expect(offsets[text.indexOf('&')]).toBe(source.indexOf('&amp;'));
  expect(offsets[text.indexOf('🙂')]).toBe(source.indexOf('&#x1F642;'));
  expect(offsets[text.indexOf('z')]).toBe(source.indexOf('z'));
  expect(offsets.at(-1)).toBe(source.length);
});

it('keeps Unicode and multiline source boundaries without inserting line breaks', () => {
  const source = 'árbol 日本語\nsegunda línea';
  expect(sourceTextOffsets(source, source, document)).toEqual(
    Array.from({ length: source.length + 1 }, (_, index) => index),
  );
});
