// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MarkdownPreview } from '../../src/renderer/editor/markdown-preview';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi } from '../support/renderer-api';

afterEach(cleanup);

function html(body: string) {
  const store = createWorkspaceStore(createApi().api);
  const { container, unmount } = render(
    <WorkspaceProvider store={store}>
      <MarkdownPreview body={body} />
    </WorkspaceProvider>,
  );
  const result = container.innerHTML;
  unmount();
  return result;
}

const note = [
  '# Title',
  '',
  'A paragraph with **bold**, `code` and a [link](https://example.com).',
  'Second line of the same paragraph.',
  '',
  '- one',
  '',
  '- [ ] two',
  '',
  '  more two',
  '',
  '1. first',
  '2. second',
  '',
  '> [!NOTE]',
  '> An alert.',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '```ts',
  'const a = 1;',
  '',
  'const b = 2;',
  '```',
  '',
  '---',
  '',
  'Last ==highlight== :smile:',
].join('\n');

it('renders a note split into blocks exactly like the whole note', () => {
  // A reference definition renders nothing but keeps the note in one block.
  const whole = html(`${note}\n\n[unused]: https://example.com`);
  // Only the newline text nodes between top-level blocks may differ.
  const flat = (value: string) => value.replaceAll('>\n<', '><');
  expect(flat(html(note))).toBe(flat(whole));
});

it('keeps absolute source lines in later blocks', () => {
  const store = createWorkspaceStore(createApi().api);
  const { container } = render(
    <WorkspaceProvider store={store}>
      <MarkdownPreview body={note} />
    </WorkspaceProvider>,
  );
  const table = container.querySelector('table')!;
  expect(table.dataset.sourceLine).toBe('18');
  const last = [...container.querySelectorAll('p')].at(-1)!;
  expect(last.dataset.sourceLine).toBe('30');
  expect(
    last
      .querySelector('[data-source-text-line]')
      ?.getAttribute('data-source-text-line'),
  ).toBe('30');
});
