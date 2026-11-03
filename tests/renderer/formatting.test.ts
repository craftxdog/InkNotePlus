// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { formatSelection } from '../../src/renderer/editor/formatting';

let view: EditorView;
afterEach(() => view?.destroy());
function editor(doc: string, from: number, to = from) {
  view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: from, head: to } }),
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
  it('numbers every selected line without including the next unselected line', () => {
    formatSelection(editor('alpha\nbeta\ngamma', 0, 11), 'ordered');
    expect(view.state.doc.toString()).toBe('1. alpha\n2. beta\ngamma');
  });
  it('separates a horizontal rule from surrounding paragraphs', () => {
    formatSelection(editor('alpha\nbeta', 6), 'rule');
    expect(view.state.doc.toString()).toBe('alpha\n\n\n---\n\nbeta');
  });
});
