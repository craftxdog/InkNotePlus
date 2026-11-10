// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import {
  acceptCompletion,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
} from '@codemirror/autocomplete';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownEditor } from '../../src/renderer/editor/markdown-editor';
import {
  defaultPreferences,
  type Preferences,
} from '../../src/shared/preferences';
import { tableCommands } from '../../src/renderer/editor/table-editor';
import { installShortcuts } from '../../src/renderer/shortcuts';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi } from '../support/renderer-api';

afterEach(cleanup);

function editor(
  doc: string,
  selection: { anchor: number; head?: number },
  preferences: Partial<Preferences> = {},
) {
  const { container } = render(
    <MarkdownEditor
      value={doc}
      nonce=""
      onView={() => {}}
      onChange={() => {}}
      preferences={{ ...defaultPreferences, ...preferences }}
    />,
  );
  const view = EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
  view.dispatch({ selection });
  view.focus();
  return view;
}

function tab(view: EditorView, shiftKey = false) {
  return fireEvent.keyDown(view.contentDOM, {
    key: 'Tab',
    keyCode: 9,
    shiftKey,
  });
}

it.each([
  ['- parent', 2],
  ['1. parent', 3],
  ['10. parent', 4],
] as const)(
  'uses the width of %s to indent and outdent a task item',
  (parent, width) => {
    const doc = `${parent}\n- [x] child`;
    const view = editor(doc, { anchor: doc.length });
    expect(tab(view)).toBe(false);
    expect(view.state.doc.toString()).toBe(
      `${parent}\n${' '.repeat(width)}- [x] child`,
    );
    expect(view.state.selection.main.head).toBe(doc.length + width);
    expect(tab(view, true)).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(doc.length);
  },
);

it('moves selected siblings and their descendants together inside a quote', () => {
  const doc = '> - parent\n> - second\n>   - child\n> - third';
  const view = editor(doc, { anchor: doc.indexOf('second'), head: doc.length });
  tab(view);
  expect(view.state.doc.toString()).toBe(
    '> - parent\n>   - second\n>     - child\n>   - third',
  );
  tab(view, true);
  expect(view.state.doc.toString()).toBe(doc);
});

it('lets Escape then Tab move focus out of the editor', () => {
  const doc = '- first\n- second';
  const view = editor(doc, { anchor: doc.length });
  fireEvent.keyDown(view.contentDOM, { key: 'Escape', keyCode: 27 });
  expect(tab(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(doc);
});

it('honors disabling default Tab indentation in Preferences', () => {
  const doc = '- first\n- second';
  const view = editor(
    doc,
    { anchor: doc.length },
    {
      keybindings: [{ command: 'editor:indent-more', keystroke: '' }],
    },
  );
  expect(tab(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(doc);
});

it('handles real shortcut events and ignores repeated keydown while the key is held', () => {
  const view = editor('text', { anchor: 0, head: 4 });
  const { api } = createApi();
  const stop = installShortcuts(createWorkspaceStore(api));
  try {
    fireEvent.keyDown(view.contentDOM, { key: 'b', ctrlKey: true });
    expect(view.state.doc.toString()).toBe('**text**');
    fireEvent.keyDown(view.contentDOM, {
      key: 'b',
      ctrlKey: true,
      repeat: true,
    });
    expect(view.state.doc.toString()).toBe('**text**');
    fireEvent.keyDown(view.contentDOM, { key: 'b', ctrlKey: true });
    expect(view.state.doc.toString()).toBe('text');
  } finally {
    stop();
  }
});

it('moves across table cells and appends a row instead of indenting the table', () => {
  const doc = '> | a | b |\n> |---|---|\n> | c | d |';
  const view = editor(doc, { anchor: doc.indexOf('c') });
  tab(view);
  expect(
    view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    ),
  ).toBe('d');
  tab(view, true);
  expect(
    view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    ),
  ).toBe('c');
  tab(view);
  tab(view);
  expect(view.state.doc.toString()).toBe(doc + '\n> |   |   |');
  expect(view.state.selection.main.head).toBeGreaterThan(doc.length);
});

it('aligns and moves table columns with their escaped Markdown and keeps the quote prefix', () => {
  const doc = '> | First | Second |\n> |---|---|\n> | a \\| b | c |';
  const view = editor(doc, { anchor: doc.indexOf('a \\| b') });
  expect(tableCommands['table-editor:align-center'](view)).toBe(true);
  expect(tableCommands['table-editor:move-column-right'](view)).toBe(true);
  expect(view.state.doc.toString()).toBe(
    '> | Second | First  |\n> | ------ | :----: |\n> | c      | a \\| b |',
  );
  expect(
    view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    ),
  ).toBe('a \\| b');
});

it('accepts a slash command and replaces the trigger with editable Markdown', async () => {
  const doc = '/tareas';
  const view = editor(doc, { anchor: doc.length });
  startCompletion(view);
  await vi.waitFor(() =>
    expect(
      currentCompletions(view.state).some(
        ({ label }) => label === 'Lista de tareas',
      ),
    ).toBe(true),
  );
  const index = currentCompletions(view.state).findIndex(
    ({ label }) => label === 'Lista de tareas',
  );
  view.dispatch({ effects: setSelectedCompletion(index) });
  await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true));
  expect(view.state.doc.toString()).toBe('- [ ] tarea');
  expect(
    view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    ),
  ).toBe('tarea');
});

it('loads optional Vim mode and processes a normal-mode delete', async () => {
  const view = editor('first\nsecond', { anchor: 0 }, { keyboardMode: 'vim' });
  await vi.waitFor(() =>
    expect(view.scrollDOM.classList.contains('cm-vimMode')).toBe(true),
  );
  fireEvent.keyDown(view.contentDOM, { key: 'd' });
  fireEvent.keyDown(view.contentDOM, { key: 'd' });
  expect(view.state.doc.toString()).toBe('second');
});

it('offers GitHub emoji names and inserts the selected Unicode character', async () => {
  const view = editor('Listo :spa', { anchor: 10 });
  startCompletion(view);
  await vi.waitFor(() =>
    expect(
      currentCompletions(view.state).some(
        ({ label }) => label === ':sparkles:',
      ),
    ).toBe(true),
  );
  const index = currentCompletions(view.state).findIndex(
    ({ label }) => label === ':sparkles:',
  );
  view.dispatch({ effects: setSelectedCompletion(index) });
  await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true));
  expect(view.state.doc.toString()).toBe('Listo ✨');
});
