// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it } from 'vitest';
import {
  jumpToNoteLine,
  previewLineAtTop,
} from '../../src/renderer/editor/note-navigation';

afterEach(() => {
  document.body.replaceChildren();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

function layout(mode: string) {
  document.body.innerHTML = `<main class="editor-layout" data-editor-mode="${mode}">
    <section class="pane--editor"></section>
    <aside class="pane--preview"><h1 data-source-line="1"></h1><p data-source-line="5"></p><p data-source-line="9"></p></aside>
  </main>`;
  return document.querySelector<HTMLElement>('.pane--preview')!;
}

it('places the editor cursor at the start of the requested line', () => {
  layout('split');
  const view = new EditorView({
    parent: document.querySelector('.pane--editor')!,
    state: EditorState.create({ doc: 'uno\ndos\ntres' }),
  });
  expect(jumpToNoteLine(3)).toBe(true);
  expect(view.state.selection.main.head).toBe(8);
  expect(jumpToNoteLine(99)).toBe(true);
  expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3);
  view.destroy();
});

it('scrolls the preview to the block of that line when the editor is hidden', () => {
  const pane = layout('preview');
  const scrolled: Element[] = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
  expect(jumpToNoteLine(4)).toBe(true);
  expect(scrolled).toEqual([pane.children[1]]);
});

it('reports failure when the note has no rendered position', () => {
  layout('preview');
  Element.prototype.scrollIntoView = () => {};
  expect(jumpToNoteLine(50)).toBe(false);
});

it('reads the source line of the first visible preview block', () => {
  const pane = layout('preview');
  pane.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  [...pane.children].forEach((child, index) => {
    child.getBoundingClientRect = () =>
      ({ bottom: 60 + index * 60 }) as DOMRect;
  });
  expect(previewLineAtTop(pane)).toBe(5);
});
