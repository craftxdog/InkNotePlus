// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it } from 'vitest';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success } from '../../src/shared/ipc';
import { createApi, firstNote } from '../support/renderer-api';

afterEach(() => {
  cleanup();
  delete (document as Partial<Document>).caretPositionFromPoint;
});

const body =
  '# Title\n\nFirst paragraph.\n\nSee **bold words** [here](https://example.com) now.';

async function open() {
  const { api } = createApi({
    list: async () => success([{ ...firstNote, body }]),
  });
  render(<App store={createWorkspaceStore(api)} />);
  const editor = EditorView.findFromDOM(
    await screen.findByRole('textbox', {
      name: 'Contenido Markdown de la nota',
    }),
  )!;
  return editor;
}

function pointAt(text: string, offset: number) {
  const span = [
    ...document.querySelectorAll<HTMLElement>(
      '.mde-preview [data-source-text-line]',
    ),
  ].find((candidate) => candidate.textContent === text)!;
  const node = span.firstChild!;
  document.caretPositionFromPoint = () =>
    ({ offsetNode: node, offset }) as unknown as CaretPosition;
  return span;
}

it('moves the editor cursor to the exact letter double-clicked in the preview', async () => {
  const editor = await open();
  // "bold words" is rendered without its ** markers; offset 5 is the "w".
  fireEvent.doubleClick(pointAt('bold words', 5));
  expect(editor.state.selection.main.head).toBe(body.indexOf('words'));
  expect(editor.hasFocus).toBe(true);
});

it('ignores double clicks on links', async () => {
  const editor = await open();
  const before = editor.state.selection.main.head;
  fireEvent.doubleClick(pointAt('here', 1));
  expect(editor.state.selection.main.head).toBe(before);
});
