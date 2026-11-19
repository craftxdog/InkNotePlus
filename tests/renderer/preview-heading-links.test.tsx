// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { MarkdownPreview } from '../../src/renderer/editor/markdown-preview';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi } from '../support/renderer-api';

const scrolled: Element[] = [];
beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
});
afterEach(() => {
  cleanup();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

const body = [
  '# Instalación rápida',
  '',
  '## Uso `básico` y **más**',
  '',
  '## Notas',
  '',
  'Texto',
  '',
  '## Notas',
  '',
  '- [Ir](#instalación-rápida)',
  '- [Uso](#uso-básico-y-más)',
  '- [Segunda](#notas-1)',
  '- [Codificado](#instalaci%C3%B3n-r%C3%A1pida)',
  '- [Nada](#no-existe)',
].join('\n');

it('follows links to headings with GitHub-style ids, including duplicates', () => {
  const store = createWorkspaceStore(createApi().api);
  const { getByRole } = render(
    <WorkspaceProvider store={store}>
      <MarkdownPreview body={body} />
    </WorkspaceProvider>,
  );
  const headings = [...document.querySelectorAll('h1, h2')];
  for (const [name, index] of [
    ['Ir', 0],
    ['Uso', 1],
    ['Segunda', 3],
    ['Codificado', 0],
  ] as const) {
    scrolled.length = 0;
    fireEvent.click(getByRole('link', { name }));
    expect(scrolled).toEqual([headings[index]]);
  }
  scrolled.length = 0;
  fireEvent.click(getByRole('link', { name: 'Nada' }));
  expect(scrolled).toEqual([]);
});
