// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi, firstNote } from '../support/renderer-api';
import { success } from '../../src/shared/ipc';
import { EditorView } from '@codemirror/view';

afterEach(cleanup);
it('opens the native editor search panel and closes it through the command registry', async () => {
  const { api } = createApi({ list: async () => success([firstNote]) });
  const { container } = render(<App store={createWorkspaceStore(api)} />);
  const editor = await screen.findByRole('textbox', {
    name: 'Contenido Markdown de la nota',
  });
  fireEvent.keyDown(editor, { key: 'f', ctrlKey: true });
  const input = container.querySelector<HTMLInputElement>(
    '.cm-search input[name="search"]',
  )!;
  expect(input).not.toBeNull();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(container.querySelector('.cm-search')).toBeNull();
});
it('commits a focused font field when Preferences closes with Escape', async () => {
  const { api } = createApi({ list: async () => success([]) });
  const store = createWorkspaceStore(api);
  render(<App store={store} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preferencias' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Edición' }));
  const font = screen.getByRole('textbox', { name: /Fuente del editor/ });
  font.focus();
  fireEvent.change(font, { target: { value: 'Menlo' } });
  fireEvent(
    screen.getByRole('dialog', { name: 'Preferencias' }),
    new Event('cancel', { cancelable: true }),
  );
  await waitFor(async () =>
    expect(await api.preferences.get()).toMatchObject({
      data: { preferences: { editorFontFamily: 'Menlo' } },
    }),
  );
});
it('opens complete preferences with a shortcut, applies editor settings without losing the draft or undo state, and persists overrides', async () => {
  const { api } = createApi({ list: async () => success([firstNote]) });
  const store = createWorkspaceStore(api);
  render(<App store={store} />);
  const content = await screen.findByRole('textbox', {
    name: 'Contenido Markdown de la nota',
  });
  const view = EditorView.findFromDOM(content)!;
  fireEvent.keyDown(window, { key: ',', ctrlKey: true });
  await screen.findByRole('dialog', { name: 'Preferencias' });
  fireEvent.click(screen.getByRole('tab', { name: 'Edición' }));
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Mostrar números de línea' }),
  );
  await waitFor(() =>
    expect(store.getState().preferences.lineNumbers).toBe(false),
  );
  expect(EditorView.findFromDOM(content)).toBe(view);
  expect(document.querySelector('.cm-lineNumbers')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Vista previa' }));
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Renderizar fórmulas matemáticas' }),
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Atajos' }));
  const binding = screen.getByRole('textbox', { name: 'Atajo: Nueva nota' });
  fireEvent.change(binding, { target: { value: 'Mod-Shift-n' } });
  fireEvent.blur(binding);
  await waitFor(async () =>
    expect(await api.preferences.get()).toMatchObject({
      data: {
        preferences: {
          lineNumbers: false,
          mathEnabled: false,
          keybindings: [{ command: 'core:new-note', keystroke: 'Mod-Shift-n' }],
        },
      },
    }),
  );
});
