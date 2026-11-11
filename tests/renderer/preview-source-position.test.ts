// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it, vi } from 'vitest';
import {
  previewAtSource,
  sourceTextOffsets,
} from '../../src/renderer/editor/preview-source-position';

afterEach(() => vi.restoreAllMocks());

function mockTextGeometry() {
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = createRange();
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => new DOMRect(0, 40, 6, 18),
    });
    return range;
  });
}

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

it('pairs preview coordinates with the visible source character when the scroll anchor is inside a hidden link URL', () => {
  const source = '[label](https://example.invalid/a/long/source-mapping-path)';
  const view = new EditorView({ state: EditorState.create({ doc: source }) });
  const preview = document.createElement('aside');
  preview.innerHTML =
    '<span data-source-text-line="1" data-source-text-end-line="1" data-source-text-column="2" data-source-text-end-column="7">label</span>';
  mockTextGeometry();
  try {
    expect(
      previewAtSource(view, preview, source.indexOf('source-mapping')),
    ).toEqual({
      position: source.indexOf('label') + 'label'.length - 1,
      y: 40,
    });
  } finally {
    view.destroy();
  }
});

it('chooses the closest visible wrapped row on either side of a hidden URL', () => {
  const source =
    '[label](https://example.invalid/a/long/source-mapping-path) next';
  const position = source.indexOf('source-mapping');
  const next = source.indexOf(' next');
  const view = new EditorView({ state: EditorState.create({ doc: source }) });
  const preview = document.createElement('aside');
  preview.innerHTML =
    '<span data-source-text-line="1" data-source-text-end-line="1" data-source-text-column="2" data-source-text-end-column="7">label</span>' +
    `<span data-source-text-line="1" data-source-text-end-line="1" data-source-text-column="${next + 1}" data-source-text-end-column="${source.length + 1}"> next</span>`;
  mockTextGeometry();
  vi.spyOn(view, 'coordsAtPos').mockImplementation((at) => {
    const top = at === position ? 200 : at < position ? 152 : 224;
    return { top, bottom: top + 24, left: 0, right: 8 };
  });
  try {
    expect(previewAtSource(view, preview, position)?.position).toBe(next);
    expect(previewAtSource(view, preview, position, 190)?.position).toBe(
      source.indexOf('label') + 'label'.length - 1,
    );
  } finally {
    view.destroy();
  }
});
