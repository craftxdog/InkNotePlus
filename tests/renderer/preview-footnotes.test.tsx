// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success } from '../../src/shared/ipc';
import { createApi, firstNote } from '../support/renderer-api';

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

async function renderFootnote() {
  const { api } = createApi({
    list: async () =>
      success([
        { ...firstNote, body: 'Text[^1] here.\n\n[^1]: The footnote.\n' },
      ]),
  });
  const openExternal = vi.fn(api.links.openExternal);
  api.links.openExternal = openExternal;
  render(<App store={createWorkspaceStore(api)} />);
  const reference = await waitFor(() => {
    const link = document.querySelector<HTMLAnchorElement>(
      '.mde-preview a[href="#user-content-fn-1"]',
    );
    expect(link).not.toBeNull();
    return link!;
  });
  return { reference, openExternal };
}

it('jumps from a footnote reference to its definition inside the preview', async () => {
  const { reference, openExternal } = await renderFootnote();
  fireEvent.click(reference);
  expect(scrolled.map(({ id }) => id)).toEqual(['user-content-fn-1']);
  expect(openExternal).not.toHaveBeenCalled();
});

it('returns from the definition to the original reference', async () => {
  const { reference, openExternal } = await renderFootnote();
  const back = document.querySelector<HTMLAnchorElement>(
    '.mde-preview a[data-footnote-backref]',
  )!;
  fireEvent.click(back);
  expect(scrolled).toEqual([reference]);
  expect(openExternal).not.toHaveBeenCalled();
});

it('ignores an in-page link without a target', async () => {
  const { api } = createApi({
    list: async () =>
      success([{ ...firstNote, body: '[missing](#nowhere)\n' }]),
  });
  const openExternal = vi.fn(api.links.openExternal);
  api.links.openExternal = openExternal;
  render(<App store={createWorkspaceStore(api)} />);
  const link = await waitFor(() => {
    const element = document.querySelector('.mde-preview a[href="#nowhere"]');
    expect(element).not.toBeNull();
    return element!;
  });
  fireEvent.click(link);
  expect(scrolled).toEqual([]);
  expect(openExternal).not.toHaveBeenCalled();
});
