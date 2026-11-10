// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { afterEach, describe, expect, it } from 'vitest';
import { formatSelection } from '../../src/renderer/editor/formatting';

let view: EditorView;
afterEach(() => view?.destroy());
function editor(doc: string, from: number, to = from) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: from, head: to },
      extensions: markdown({ base: markdownLanguage }),
    }),
  });
  return view;
}
describe('Markdown toolbar editing', () => {
  it('wraps the selected text and keeps that text selected for replacement', () => {
    formatSelection(editor('hello world', 6, 11), 'bold');
    expect(view.state.doc.toString()).toBe('hello **world**');
    const selection = view.state.selection.main;
    expect(view.state.sliceDoc(selection.from, selection.to)).toBe('world');
  });
  it.each([
    ['bold', '**word**'],
    ['italic', '*word*'],
    ['strike', '~~word~~'],
    ['code', '`word`'],
  ] as const)(
    'toggles %s without adding duplicate marks',
    (command, styled) => {
      formatSelection(editor('word', 4, 0), command);
      expect(view.state.doc.toString()).toBe(styled);
      formatSelection(view, command);
      expect(view.state.doc.toString()).toBe('word');
      expect(view.state.selection.main).toMatchObject({ anchor: 4, head: 0 });
    },
  );
  it('removes one emphasis style at a time', () => {
    formatSelection(editor('**word**', 2, 6), 'italic');
    expect(view.state.doc.toString()).toBe('***word***');
    formatSelection(view, 'bold');
    expect(view.state.doc.toString()).toBe('*word*');
    formatSelection(view, 'italic');
    expect(view.state.doc.toString()).toBe('word');
  });
  it('unwraps existing Markdown marks at the caret or on a full selection', () => {
    formatSelection(editor('__first__ and _second_', 4), 'bold');
    expect(view.state.doc.toString()).toBe('first and _second_');
    expect(view.state.selection.main.anchor).toBe(2);
    view.dispatch({ selection: { anchor: 10, head: 18 } });
    formatSelection(view, 'italic');
    expect(view.state.doc.toString()).toBe('first and second');
  });
  it('keeps surrounding whitespace outside the formatting marks', () => {
    formatSelection(editor('A word here', 1, 7), 'italic');
    expect(view.state.doc.toString()).toBe('A *word* here');
    formatSelection(view, 'italic');
    expect(view.state.doc.toString()).toBe('A word here');
  });
  it('toggles the selected placeholder when the command started at an empty caret', () => {
    formatSelection(editor('', 0), 'bold');
    expect(view.state.doc.toString()).toBe('**texto**');
    formatSelection(view, 'bold');
    expect(view.state.doc.toString()).toBe('texto');
  });
  it('uses reversible delimiters for code containing backticks', () => {
    formatSelection(editor('`fragment` and other', 0, 16), 'code');
    expect(view.state.doc.toString()).toBe('`` `fragment` and o ``ther');
    formatSelection(view, 'code');
    expect(view.state.doc.toString()).toBe('`fragment` and other');
  });
  it('toggles block formats in place, preserving the quote and indentation', () => {
    const doc = '> - parent\n>   child';
    formatSelection(editor(doc, doc.length), 'task');
    expect(view.state.doc.toString()).toBe('> - parent\n>   - [ ] child');
    formatSelection(view, 'task');
    expect(view.state.doc.toString()).toBe(doc);
    formatSelection(view, 'heading');
    expect(view.state.doc.toString()).toBe('> - parent\n>   ## child');
    formatSelection(view, 'heading');
    expect(view.state.doc.toString()).toBe(doc);
  });
  it('numbers every selected line without including the next unselected line', () => {
    formatSelection(editor('alpha\nbeta\ngamma', 0, 11), 'ordered');
    expect(view.state.doc.toString()).toBe('1. alpha\n2. beta\ngamma');
  });
  it('separates a horizontal rule from surrounding paragraphs', () => {
    formatSelection(editor('alpha\nbeta', 6), 'rule');
    expect(view.state.doc.toString()).toBe('alpha\n\n\n* * *\n\nbeta');
  });
});
