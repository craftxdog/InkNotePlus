// @vitest-environment jsdom
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  linkPasteMenu,
  pasteUrlAtCursor,
} from '../../src/renderer/editor/link-paste-menu';
import { defaultPreferences } from '../../src/shared/preferences';

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));
const url = 'https://example.com/guia';
const flush = () => new Promise((resolve) => setTimeout(resolve));

function editor(
  doc = 'Ver ',
  {
    auto = false,
    title = vi.fn(async (): Promise<string | null> => 'Guía [oficial]'),
  } = {},
) {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        markdown({ base: markdownLanguage }),
        EditorState.allowMultipleSelections.of(true),
        linkPasteMenu({ fetchTitle: title, autoFetch: () => auto }),
        keymap.of([]),
      ],
    }),
  });
  ensureSyntaxTree(view.state, doc.length, 1000);
  views.push(view);
  return { view, title };
}
const menu = (view: EditorView) =>
  view.dom.querySelector<HTMLElement>('.inknote-link-menu');
const button = (view: EditorView, label: string | RegExp) =>
  [...menu(view)!.querySelectorAll('button')].find((item) =>
    typeof label === 'string'
      ? item.textContent === label
      : label.test(item.textContent ?? ''),
  )!;
const text = (view: EditorView) => view.state.doc.toString();
const key = (view: EditorView, name: string) =>
  runScopeHandlers(view, new KeyboardEvent('keydown', { key: name }), 'editor');

describe('pasting a URL at the cursor', () => {
  it('inserts the URL and offers its formats', () => {
    const { view } = editor();
    expect(pasteUrlAtCursor(view, `  ${url}\n`)).toBe(true);
    expect(text(view)).toBe(`Ver ${url}`);
    expect(
      [...menu(view)!.querySelectorAll('button')].map(
        (item) => item.textContent,
      ),
    ).toEqual(['URL', 'Enlace', 'Buscar título']);
  });
  it('keeps the plain URL', () => {
    const { view } = editor();
    pasteUrlAtCursor(view, url);
    button(view, 'URL').click();
    expect(text(view)).toBe(`Ver ${url}`);
    expect(menu(view)).toBeNull();
  });
  it('creates an empty link with the cursor ready for its text', () => {
    const { view } = editor();
    pasteUrlAtCursor(view, url);
    button(view, 'Enlace').click();
    expect(text(view)).toBe(`Ver [](${url})`);
    expect(view.state.selection.main.head).toBe('Ver ['.length);
    expect(menu(view)).toBeNull();
  });
  it.each([
    ['plain text', 'Ver ', 'hola'],
    [
      'an internal note link',
      'Ver ',
      'inknote://note/5a5115f8-747f-416d-82d5-d9c12e34d323',
    ],
    ['inline code', 'usa `ab` ya', url],
    ['a fenced block', '```\na', url],
  ])('leaves %s to the normal paste', (_name, doc, pasted) => {
    const { view } = editor(doc);
    if (doc.includes('`ab`'))
      view.dispatch({ selection: { anchor: doc.indexOf('b') } });
    expect(pasteUrlAtCursor(view, pasted)).toBe(false);
    expect(text(view)).toBe(doc);
  });
  it('ignores selections and multiple cursors', () => {
    const { view } = editor('uno dos');
    view.dispatch({ selection: { anchor: 0, head: 3 } });
    expect(pasteUrlAtCursor(view, url)).toBe(false);
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(3),
      ]),
    });
    expect(pasteUrlAtCursor(view, url)).toBe(false);
  });
});

describe('page titles require permission', () => {
  it('is off by default', () => {
    expect(defaultPreferences.linkTitleFetch).toBe(false);
  });
  it('never contacts the page until the user asks', async () => {
    const { view, title } = editor();
    pasteUrlAtCursor(view, url);
    await flush();
    expect(title).not.toHaveBeenCalled();
    button(view, 'Buscar título').click();
    expect(title).toHaveBeenCalledExactlyOnceWith(url);
    expect(button(view, 'Buscando título…').disabled).toBe(true);
    await flush();
    button(view, /^Usar «Guía \[oficial\]»$/).click();
    expect(text(view)).toBe(`Ver [Guía \\[oficial\\]](${url})`);
    expect(view.state.selection.main.head).toBe(text(view).length);
  });
  it('searches on paste when the preference is on', async () => {
    const { view, title } = editor('Ver ', { auto: true });
    pasteUrlAtCursor(view, url);
    expect(title).toHaveBeenCalledExactlyOnceWith(url);
    await flush();
    expect(button(view, /^Usar/)).toBeTruthy();
    expect(text(view)).toBe(`Ver ${url}`);
  });
  it.each([
    ['no title', async () => null],
    [
      'a failed request',
      async () => {
        throw new Error('red');
      },
    ],
  ])('reports %s and keeps the URL', async (_name, title) => {
    const { view } = editor('Ver ', { auto: true, title: vi.fn(title) });
    pasteUrlAtCursor(view, url);
    await flush();
    expect(button(view, 'Título no disponible').disabled).toBe(true);
    expect(text(view)).toBe(`Ver ${url}`);
  });
  it('discards a title that arrives after the menu closed', async () => {
    let resolve!: (value: string) => void;
    const title = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const { view } = editor('Ver ', { auto: true, title });
    pasteUrlAtCursor(view, url);
    view.dispatch({
      changes: { from: view.state.doc.length, insert: ' más' },
      selection: { anchor: view.state.doc.length + 4 },
    });
    expect(menu(view)).toBeNull();
    resolve('Tarde');
    await flush();
    expect(menu(view)).toBeNull();
    expect(text(view)).toBe(`Ver ${url} más`);
  });
});

describe('closing the menu', () => {
  it('closes when the cursor moves away', () => {
    const { view } = editor();
    pasteUrlAtCursor(view, url);
    view.dispatch({ selection: { anchor: 0 } });
    expect(menu(view)).toBeNull();
  });
  it('follows text inserted before the URL', () => {
    const { view } = editor();
    pasteUrlAtCursor(view, url);
    view.dispatch({ changes: { from: 0, insert: 'Hoy ' } });
    button(view, 'Enlace').click();
    expect(text(view)).toBe(`Hoy Ver [](${url})`);
  });
  it('closes with Escape and moves into the menu with Tab', () => {
    const { view } = editor();
    pasteUrlAtCursor(view, url);
    expect(key(view, 'Tab')).toBe(true);
    expect(document.activeElement).toBe(button(view, 'URL'));
    expect(key(view, 'Escape')).toBe(true);
    expect(menu(view)).toBeNull();
    expect(key(view, 'Escape')).toBe(false);
  });
});
