// @vitest-environment jsdom
import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { failure, success } from '../../src/shared/ipc';
import { createApi, firstNote } from '../support/renderer-api';

afterEach(cleanup);

describe('React workspace', () => {
  it('loads a readable built-in theme when preference bootstrap fails', async () => {
    const { api } = createApi({ list: async () => success([]) });
    api.preferences.get = async () => failure('unavailable');
    const store = createWorkspaceStore(api);
    render(<App store={store} />);
    await waitFor(() => expect(store.getState().preferencesError).toBe(true));
    await waitFor(() =>
      expect(
        document.head.querySelectorAll(
          'link[data-theme-package="inknote-light"]',
        ),
      ).toHaveLength(3),
    );
  });

  it('loads, edits and saves a note through the bridge', async () => {
    const bridge = createApi({
      list: async () => success([firstNote]),
      update: async (input) => success({ ...firstNote, ...input, revision: 2 }),
    });
    const store = createWorkspaceStore(bridge.api);
    render(<App store={store} />);
    const body = await screen.findByRole('textbox', {
      name: 'Contenido Markdown de la nota',
    });
    const view = EditorView.findFromDOM(body)!;
    act(() =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: 'Edited body' },
      }),
    );
    await waitFor(() =>
      expect(document.querySelector('.mde-preview p')?.textContent).toBe(
        'Edited body',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(store.getState().document.isDirty).toBe(false));
    expect(store.getState().document.revision).toBe(2);
  });

  it('escapes note content and never interprets it as HTML', async () => {
    const body =
      '# Seguro\n\n<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\n![remota](https://example.com/tracking.png)';
    const { api } = createApi({
      list: async () => success([{ ...firstNote, body }]),
    });
    const { container } = render(<App store={createWorkspaceStore(api)} />);
    await screen.findByRole('heading', { name: 'Seguro' });
    expect(container.querySelector('.mde-preview img')).toBeNull();
    expect(container.querySelector('.mde-preview script')).toBeNull();
    expect(screen.getByText('[Imagen: remota]')).toBeTruthy();
  });

  it('preserves keyboard focus as typing changes Zustand state', async () => {
    const { api } = createApi({ list: async () => success([firstNote]) });
    render(<App store={createWorkspaceStore(api)} />);
    const title = await screen.findByDisplayValue(firstNote.title);
    title.focus();
    fireEvent.change(title, { target: { value: 'Typing' } });
    expect(document.activeElement).toBe(title);
  });

  it('switches all three theme areas together and keeps preferences across reconnects', async () => {
    const bridge = createApi({ list: async () => success([]) });
    const store = createWorkspaceStore(bridge.api);
    const { unmount } = render(<App store={store} />);
    await screen.findByText('No hay notas en esta vista.');
    fireEvent.click(screen.getByRole('button', { name: 'Preferencias' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Temas' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Tema' }), {
      target: { value: 'inknote-dark' },
    });
    await waitFor(() =>
      expect(store.getState().preferences.theme).toBe('inknote-dark'),
    );
    expect(
      document.head.querySelectorAll('link[data-theme-package="inknote-dark"]'),
    ).toHaveLength(3);
    await waitFor(async () =>
      expect(await bridge.api.preferences.get()).toMatchObject({
        data: { preferences: { theme: 'inknote-dark' } },
      }),
    );
    unmount();
    const next = createWorkspaceStore(bridge.api);
    render(<App store={next} />);
    await waitFor(() =>
      expect(next.getState().preferences.theme).toBe('inknote-dark'),
    );
  });

  it('cleans IPC subscriptions after StrictMode replay and unmount', async () => {
    const bridge = createApi({ list: async () => success([]) });
    const { unmount } = render(
      <StrictMode>
        <App store={createWorkspaceStore(bridge.api)} />
      </StrictMode>,
    );
    await screen.findByText('No hay notas en esta vista.');
    expect(bridge.listenerCount).toBe(1);
    unmount();
    expect(bridge.listenerCount).toBe(0);
  });

  it('renders named layouts and safe load errors', async () => {
    const store = createWorkspaceStore(createApi().api);
    const { container } = render(<App store={store} />);
    await screen.findByText('No se pudo cargar esta vista.');
    act(() => store.getState().setSidebarVisible(false));
    expect(container.querySelector('[data-layout="main:slim"]')).not.toBeNull();
    act(() => store.getState().setDistractionFreeEnabled(true));
    expect(
      container.querySelector('[data-layout="main:distraction-free"]'),
    ).not.toBeNull();
  });
});
