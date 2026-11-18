// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewFindBar } from '../../src/renderer/components/preview-find-bar';
import { findPreviewMatches } from '../../src/renderer/editor/preview-find';
import { installShortcuts } from '../../src/renderer/shortcuts';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi, firstNote } from '../support/renderer-api';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});
function pane(html: string) {
  const element = document.createElement('aside');
  element.innerHTML = `<div class="mde-preview">${html}</div>`;
  document.body.append(element);
  return element;
}
const found = (element: HTMLElement, query: string) =>
  findPreviewMatches(element, query).map((range) => range.toString());

describe('finding text in the preview', () => {
  it('matches regardless of case and treats the query literally', () => {
    const element = pane('<p>Hola HOLA a.b axb</p>');
    expect(found(element, 'hola')).toEqual(['Hola', 'HOLA']);
    expect(found(element, 'a.b')).toEqual(['a.b']);
    expect(found(element, '   ')).toEqual([]);
  });
  it('finds code split across syntax highlighting tokens', () => {
    const element = pane(
      '<pre><code><span>const</span> <span>va</span><span>lor</span></code></pre>',
    );
    expect(found(element, 'const valor')).toEqual(['const valor']);
  });
  it('does not join text from different blocks', () => {
    expect(found(pane('<p>fin</p><p>al</p>'), 'final')).toEqual([]);
  });
  it('skips line numbers, copy controls and hidden math', () => {
    const element = pane(
      '<div class="codeblock-actions">copiar</div><span class="mde-preview-code-line-number">copiar</span><span class="katex-mathml">copiar</span><p>copiar</p>',
    );
    expect(findPreviewMatches(element, 'copiar')).toHaveLength(1);
  });
});

describe('preview find bar', () => {
  function mount(html = '<p>uno</p><p>uno</p><p>uno</p>') {
    const element = pane(html);
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    const onClose = vi.fn();
    const onReveal = vi.fn();
    render(
      <PreviewFindBar pane={element} onClose={onClose} onReveal={onReveal} />,
    );
    const input = screen.getByRole('searchbox', {
      name: 'Buscar en la vista previa',
    });
    return { element, input, onClose, onReveal, scrolled };
  }
  it('counts matches and cycles with Enter and Shift+Enter', () => {
    const { input, onReveal, scrolled } = mount();
    fireEvent.change(input, { target: { value: 'uno' } });
    expect(screen.getByRole('status').textContent).toBe('1 de 3');
    expect(onReveal).toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toBe('2 de 3');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(screen.getByRole('status').textContent).toBe('3 de 3');
    expect(scrolled.length).toBeGreaterThanOrEqual(4);
  });
  it('reports no results and disables navigation', () => {
    const { input } = mount();
    fireEvent.change(input, { target: { value: 'nada' } });
    expect(screen.getByRole('status').textContent).toBe('Sin resultados');
    expect(
      (
        screen.getByRole('button', {
          name: 'Coincidencia siguiente',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it('updates when the preview changes without moving the reader', async () => {
    const { input, element, scrolled } = mount();
    fireEvent.change(input, { target: { value: 'uno' } });
    const before = scrolled.length;
    element
      .querySelector('.mde-preview')!
      .append(
        Object.assign(document.createElement('p'), { textContent: 'uno' }),
      );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('1 de 4'),
    );
    expect(scrolled).toHaveLength(before);
  });
  it('closes with Escape', () => {
    const { input, onClose } = mount();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('find shortcut', () => {
  const press = () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'f',
        ctrlKey: true,
        cancelable: true,
      }),
    );
  it('opens the preview search outside the editor when a preview is visible', () => {
    const store = createWorkspaceStore(createApi().api);
    store.setState((state) => ({
      platform: 'linux',
      document: { ...state.document, noteId: firstNote.id },
    }));
    const stop = installShortcuts(store);
    press();
    expect(store.getState().previewFindOpen).toBe(true);
    stop();
  });
  it('stays closed when only the editor is visible', () => {
    const store = createWorkspaceStore(createApi().api);
    store.setState((state) => ({
      platform: 'linux',
      document: { ...state.document, noteId: firstNote.id },
      preferences: { ...state.preferences, editorMode: 'edit' },
    }));
    const stop = installShortcuts(store);
    press();
    expect(store.getState().previewFindOpen).toBe(false);
    stop();
  });
});
