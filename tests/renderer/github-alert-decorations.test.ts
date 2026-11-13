// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { afterEach, expect, it } from 'vitest';
import { githubAlertDecorations } from '../../src/renderer/editor/github-alert-decorations';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

function renderDecorations(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage }), githubAlertDecorations],
  });
  ensureSyntaxTree(state, doc.length, 1000);
  const view = new EditorView({
    parent: document.body,
    state: state.update({}).state,
  });
  views.push(view);
  return view.dom;
}

it('keeps the parent rail while coloring each nested alert marker independently', () => {
  const editor = renderDecorations(
    '> [!CAUTION]\n> Parent\n> > [!TIP]\n> > Child',
  );
  const lines = editor.querySelectorAll('.cm-line');
  expect(lines[2].classList.contains('md-alert-caution')).toBe(true);
  expect(lines[2].classList.contains('md-alert-tip')).toBe(false);
  expect(
    lines[2].querySelector('.md-alert-marker.md-alert-caution')?.textContent,
  ).toBe('>');
  expect(
    lines[2].querySelector('.md-alert-marker.md-alert-tip')?.textContent,
  ).toBe('> [!TIP]');
  expect(
    lines[3].querySelector('.md-alert-marker.md-alert-tip')?.textContent,
  ).toBe('>');
});

it.each(['- > [!NOTE]\n  > Body', '> - > [!NOTE]\n>   > Body'])(
  'decorates alerts in list containers without coloring list markers: %s',
  (doc) => {
    const editor = renderDecorations(doc);
    expect(
      editor.querySelector('.md-alert-marker.md-alert-note')?.textContent,
    ).toBe('> [!NOTE]');
  },
);

it('gives ordinary quotes a neutral rail while preserving nested alert markers', () => {
  const editor = renderDecorations('> Ordinary quote\n>\n> > [!TIP]\n> > Body');
  expect(editor.querySelectorAll('.md-blockquote-line')).toHaveLength(4);
  expect(editor.querySelector('.md-alert-line')).toBeNull();
  expect(
    editor.querySelector('.md-alert-marker.md-alert-tip')?.textContent,
  ).toBe('> [!TIP]');
});
