// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it } from 'vitest';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success } from '../../src/shared/ipc';
import { createApi, firstNote, secondNote } from '../support/renderer-api';
afterEach(cleanup);

it('toggles the exact duplicate task in Markdown, editor and preview while ignoring fenced text', async () => {
  const body =
    '- [ ] same\r\n- [ ] same\r\n\r\n```md\r\n- [ ] not a task\r\n```\r\n\r\n> - [X] quoted\r\n\r\n1. [ ] ordered';
  const { api } = createApi({
    list: async () => success([{ ...firstNote, body }]),
    update: async (input) => success({ ...firstNote, ...input, revision: 2 }),
  });
  const store = createWorkspaceStore(api);
  render(<App store={store} />);
  const boxes = await screen.findAllByRole('checkbox');
  expect(boxes).toHaveLength(4);
  fireEvent.click(boxes[1]);
  await waitFor(() =>
    expect(store.getState().document.body).toBe(
      body.replace('- [ ] same\r\n\r\n', '- [x] same\r\n\r\n'),
    ),
  );
  const editor = EditorView.findFromDOM(
    await screen.findByRole('textbox', {
      name: 'Contenido Markdown de la nota',
    }),
  )!;
  expect(editor.state.doc.toString()).toContain('- [x] same');
  expect(editor.state.doc.toString()).toContain('- [ ] not a task');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Tarea: quoted' }));
  await waitFor(() =>
    expect(store.getState().document.body).toContain('> - [ ] quoted'),
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Tarea: ordered' }));
  await waitFor(() =>
    expect(store.getState().document.body).toContain('1. [x] ordered'),
  );
});

it('ignores a checkbox callback from an older rendered document', async () => {
  const { api } = createApi({
    list: async () => success([{ ...firstNote, body: '- [ ] old' }]),
  });
  const store = createWorkspaceStore(api);
  await store.getState().refreshNotes();
  store.getState().updateDraft({ body: '- [ ] newer text' });
  store.getState().toggleTask('- [ ] old', 3, true);
  expect(store.getState().document.body).toBe('- [ ] newer text');
});

it('renders exact subscript and superscript pairs without enabling raw HTML', async () => {
  const body =
    'H<sub>2</sub>O x<sup>**2**</sup> <sub><mark>mix</mark></sub> <sub class="x">no</sub> <sup>open';
  const { api } = createApi({
    list: async () => success([{ ...firstNote, body }]),
  });
  const { container } = render(<App store={createWorkspaceStore(api)} />);
  await waitFor(() =>
    expect(container.querySelector('.mde-preview sub')?.textContent).toBe('2'),
  );
  const preview = container.querySelector('.mde-preview')!;
  expect(preview.querySelector('sup strong')?.textContent).toBe('2');
  expect(preview.querySelector('sub mark')?.textContent).toBe('mix');
  expect(preview.querySelector('[class="x"]')).toBeNull();
  expect(preview.querySelectorAll('sub')).toHaveLength(2);
  expect(preview.querySelectorAll('sup')).toHaveLength(1);
});

it('renders only safe highlight tags and follows internal note links inside the app', async () => {
  const body = `A <mark>**highlight**</mark>. <img src="bad" onerror="alert(1)">\n\n[Open second](inknote://note/${secondNote.id})`;
  const { api } = createApi({
    list: async (input) =>
      success(
        input?.id === secondNote.id ? [secondNote] : [{ ...firstNote, body }],
      ),
  });
  const store = createWorkspaceStore(api);
  const { container } = render(<App store={store} />);
  const link = await screen.findByRole('link', { name: 'Open second' });
  expect(container.querySelector('.mde-preview mark strong')?.textContent).toBe(
    'highlight',
  );
  expect(container.querySelector('.mde-preview img')).toBeNull();
  fireEvent.click(link);
  await waitFor(() =>
    expect(store.getState().document.noteId).toBe(secondNote.id),
  );
});
