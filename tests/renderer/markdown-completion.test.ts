// @vitest-environment jsdom
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  acceptCompletion,
  CompletionContext,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { afterEach, expect, it, vi } from 'vitest';
import { markdownCompletion } from '../../src/renderer/editor/markdown-completion';
import { completionIcon } from '../../src/renderer/editor/markdown-completion-ui';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
  document.body.replaceChildren();
});

function createView(doc: string, readOnly = false) {
  const host = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        EditorState.readOnly.of(readOnly),
        EditorState.allowMultipleSelections.of(true),
        markdown({ base: markdownLanguage }),
        markdownCompletion({
          insertImage: () => () => {},
          noteLinks: () => null,
        }),
      ],
    }),
  });
  views.push(view);
  return view;
}

async function complete(doc: string) {
  const view = createView(doc);
  view.focus();
  startCompletion(view);
  await vi.waitFor(() =>
    expect(currentCompletions(view.state).length).toBeGreaterThan(0),
  );
  return view;
}

it('groups slash commands, preserves reference order, and provides icons and syntax hints', async () => {
  const view = await complete('/');
  const options = currentCompletions(view.state);
  expect(options.slice(0, 5).map(({ label }) => label)).toEqual([
    'Bloque de código',
    'Encabezado 1',
    'Encabezado 2',
    'Encabezado 3',
    'Encabezado 4',
  ]);
  expect([
    ...new Set(
      options.map(({ section }) =>
        typeof section === 'string' ? section : section?.name,
      ),
    ),
  ]).toEqual(['Formato básico', 'Alertas de GitHub', 'Insertar']);
  for (const option of options) {
    expect(option.type).toMatch(/^inknote-/);
    expect(option.detail).toBeTruthy();
  }
  await vi.waitFor(() =>
    expect(
      view.dom.querySelectorAll(
        '.inknote-completion-section[role="presentation"]',
      ),
    ).toHaveLength(3),
  );
  const rows = view.dom.querySelectorAll('[role="option"]');
  expect(rows).toHaveLength(options.length);
  for (const row of rows)
    expect(
      row.querySelector('svg[aria-hidden="true"][focusable="false"]'),
    ).toBeTruthy();
});

it.each(['> ', '> > ', '  > '])(
  'inserts an alert inside quote prefix %s without dropping its continuation',
  async (prefix) => {
    const view = await complete(`${prefix}/tip`);
    const index = currentCompletions(view.state).findIndex(({ label }) =>
      label.includes('Tip'),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    view.dispatch({ effects: setSelectedCompletion(index) });
    await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true));
    expect(view.state.doc.toString()).toBe(
      `${prefix}> [!TIP]\n${prefix}> texto`,
    );
    expect(
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    ).toBe('texto');
  },
);

it('completes the type of an alert inside a nested blockquote', async () => {
  const view = await complete('> > [!CA');
  const index = currentCompletions(view.state).findIndex(
    ({ label }) => label === 'CAUTION',
  );
  expect(index).toBeGreaterThanOrEqual(0);
  view.dispatch({ effects: setSelectedCompletion(index) });
  await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true));
  expect(view.state.doc.toString()).toBe('> > [!CAUTION]');
});

it.each([
  '```md\n/',
  '    /',
  '`/tip`',
  '[url](https://example.com/)',
  'https://example.com/',
  'text /',
])(
  'does not offer slash commands in code, links or inline prose: %s',
  async (doc) => {
    const view = createView(doc);
    const sources = view.state.languageDataAt<CompletionSource>(
      'autocomplete',
      view.state.selection.main.head,
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources)
      expect(
        await source(
          new CompletionContext(view.state, view.state.doc.length, true),
        ),
      ).toBeNull();
  },
);

it('does not offer commands in read-only notes or across multiple cursors', async () => {
  for (const readOnly of [true, false]) {
    const view = createView('/\n/', readOnly);
    if (!readOnly)
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.cursor(1),
          EditorSelection.cursor(3),
        ]),
      });
    const sources = view.state.languageDataAt<CompletionSource>(
      'autocomplete',
      3,
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources)
      expect(
        await source(new CompletionContext(view.state, 3, true)),
      ).toBeNull();
  }
});

it('leaves icons from other completion sources alone and ignores unknown icon names', () => {
  const view = createView('');
  for (const type of [
    'code',
    'variable',
    'inknote-unknown',
    'inknote-__proto__',
  ])
    expect(
      completionIcon({ label: 'external', type }, view.state, view),
    ).toBeNull();
});
