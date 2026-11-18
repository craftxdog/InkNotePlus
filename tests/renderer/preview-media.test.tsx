// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app';
import { copyText } from '../../src/renderer/editor/clipboard';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success } from '../../src/shared/ipc';
import { defaultPreferences } from '../../src/shared/preferences';
import { createApi, firstNote } from '../support/renderer-api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});
function mount(body: string) {
  const { api } = createApi({
    list: async () => success([{ ...firstNote, body }]),
  });
  const store = createWorkspaceStore(api);
  return { store, ...render(<App store={store} />) };
}
const clipboard = (writeText: (text: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });

describe('code block actions', () => {
  it('copies the code without the trailing line break and confirms it', async () => {
    const writeText = vi.fn(async () => {});
    clipboard(writeText);
    mount('```js\nconst a = 1;\nconst b = 2;\n```\n');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Copiar código' }),
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('const a = 1;\nconst b = 2;'),
    );
    expect(
      await screen.findByRole('button', { name: 'Código copiado' }),
    ).toBeTruthy();
  });
  it('labels the language with an icon of its family', async () => {
    const { container } = mount(
      '```bash\nls\n```\n\n```json\n{}\n```\n\n```zzz\nx\n```\n',
    );
    await screen.findAllByRole('button', { name: 'Copiar código' });
    const icons = [
      ...container.querySelectorAll('.codeblock-actions [data-code-icon]'),
    ];
    expect(icons.map((icon) => icon.getAttribute('data-code-icon'))).toEqual([
      'terminal',
      'data',
      'code',
    ]);
    expect(
      container.querySelector('.codeblock-actions')?.textContent,
    ).toContain('bash');
  });
  it('numbers every block when the preference is on, keeping explicit starts', async () => {
    const { store, container } = mount(
      '```js\na\nb\n```\n\n```js line=7\nc\n```\n',
    );
    await screen.findAllByRole('button', { name: 'Copiar código' });
    expect(
      container.querySelectorAll('.mde-preview-code-line-number'),
    ).toHaveLength(1);
    await store.getState().updatePreferences({ codeLineNumbers: true });
    await waitFor(() =>
      expect(
        [...container.querySelectorAll('.mde-preview-code-line-number')].map(
          (numbers) => numbers.textContent,
        ),
      ).toEqual(['1\n2', '7']),
    );
  });
  it('leaves numbering off by default', () => {
    expect(defaultPreferences.codeLineNumbers).toBe(false);
  });
});

describe('copyText', () => {
  it('falls back to the document command when the clipboard API is denied', async () => {
    clipboard(async () => {
      throw new Error('denied');
    });
    let copied = '';
    const execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    await expect(copyText('hola')).resolves.toBe(true);
    expect(copied).toBe('hola');
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('textarea')).toBeNull();
    button.remove();
  });
  it('reports failure when no copy method works', async () => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => false,
    });
    await expect(copyText('hola')).resolves.toBe(false);
  });
});

describe('image viewer', () => {
  const body = `![Foto](inknote-asset://images/${'a'.repeat(64)}.png)\n`;
  const image = async (container: HTMLElement) =>
    waitFor(() => {
      const element =
        container.querySelector<HTMLImageElement>('.mde-preview img');
      expect(element).not.toBeNull();
      return element!;
    });
  it('opens on double click and zooms with buttons and keys', async () => {
    const { container, store } = mount(body);
    fireEvent.doubleClick(await image(container));
    const dialog = await screen.findByRole('dialog', { name: 'Foto' });
    const picture = within(dialog).getByRole('img', { name: 'Foto' });
    expect(picture.style.inlineSize).toBe('100%');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ampliar' }));
    expect(picture.style.inlineSize).toBe('150%');
    fireEvent.keyDown(dialog, { key: '+' });
    expect(picture.style.inlineSize).toBe('200%');
    fireEvent.keyDown(dialog, { key: '-' });
    fireEvent.keyDown(dialog, { key: '-' });
    fireEvent.keyDown(dialog, { key: '-' });
    expect(picture.style.inlineSize).toBe('50%');
    fireEvent.keyDown(dialog, { key: '-' });
    expect(picture.style.inlineSize).toBe('50%');
    fireEvent.keyDown(dialog, { key: '0' });
    expect(picture.style.inlineSize).toBe('100%');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Cerrar diálogo' }),
    );
    expect(store.getState().imageViewer).toBeNull();
  });
  it('opens from the keyboard', async () => {
    const { container } = mount(body);
    fireEvent.keyDown(await image(container), { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Foto' })).toBeTruthy();
  });
});
