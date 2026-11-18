// @vitest-environment jsdom
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { pasteLinkOverSelection } from '../../src/renderer/editor/link-paste';

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
function editor(doc: string, selected: string, readOnly = false) {
  const from = doc.indexOf(selected);
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: from, head: from + selected.length },
      extensions: [
        markdown({ base: markdownLanguage }),
        EditorState.readOnly.of(readOnly),
        EditorState.allowMultipleSelections.of(true),
      ],
    }),
  });
  ensureSyntaxTree(view.state, doc.length, 1000);
  views.push(view);
  return view;
}
const url = 'https://example.com/docs';

describe('pasting a URL over selected text', () => {
  it('turns the selection into a link and places the cursor after it', () => {
    const view = editor('Lee la guía hoy', 'guía');
    expect(pasteLinkOverSelection(view, url)).toBe(true);
    expect(view.state.doc.toString()).toBe(`Lee la [guía](${url}) hoy`);
    expect(view.state.selection.main.head).toBe(`Lee la [guía](${url})`.length);
  });
  it('accepts surrounding whitespace and internal note links', () => {
    const view = editor('nota', 'nota');
    const link = 'inknote://note/5a5115f8-747f-416d-82d5-d9c12e34d323';
    expect(pasteLinkOverSelection(view, `  ${link}\n`)).toBe(true);
    expect(view.state.doc.toString()).toBe(`[nota](${link})`);
  });
  it('keeps brackets and parentheses from breaking the link', () => {
    const view = editor('a [b] c', 'a [b] c');
    pasteLinkOverSelection(view, 'https://example.com/x_(y)');
    expect(view.state.doc.toString()).toBe(
      '[a \\[b\\] c](https://example.com/x_%28y%29)',
    );
  });
  it.each([
    ['plain text', 'hola mundo'],
    ['an unsafe scheme', 'javascript:alert(1)'],
    ['a URL with credentials', 'https://user:pass@example.com'],
    ['several lines', `${url}\n${url}`],
  ])('leaves %s to the normal paste', (_name, text) => {
    const view = editor('texto', 'texto');
    expect(pasteLinkOverSelection(view, text)).toBe(false);
    expect(view.state.doc.toString()).toBe('texto');
  });
  it.each([
    ['no selection', 'texto', ''],
    ['a selected URL', 'https://old.example.com', 'https://old.example.com'],
    ['inline code', 'usa `codigo` aquí', 'codigo'],
    ['a fenced block', '```\ncodigo\n```', 'codigo'],
    ['an existing link', '[texto](https://a.example)', 'texto'],
    ['several lines', 'uno\ndos', 'uno\ndos'],
  ])('does not create a link over %s', (_name, doc, selected) => {
    const view = editor(doc, selected);
    expect(pasteLinkOverSelection(view, url)).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
  it('ignores read-only notes and multiple cursors', () => {
    expect(pasteLinkOverSelection(editor('texto', 'texto', true), url)).toBe(
      false,
    );
    const view = editor('uno dos', 'uno');
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.range(0, 3),
        EditorSelection.range(4, 7),
      ]),
    });
    expect(pasteLinkOverSelection(view, url)).toBe(false);
  });
});
