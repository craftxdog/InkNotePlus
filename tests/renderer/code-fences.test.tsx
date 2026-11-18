// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownPreview } from '../../src/renderer/editor/markdown-preview';
import { parseCodeFenceMeta } from '../../src/renderer/editor/code-fence';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi } from '../support/renderer-api';

afterEach(cleanup);

function preview(body: string) {
  const store = createWorkspaceStore(createApi().api);
  const view = render(
    <WorkspaceProvider store={store}>
      <MarkdownPreview body={body} />
    </WorkspaceProvider>,
  );
  return { ...view, store };
}

it('reads documented fence attributes without interpreting their contents as HTML', () => {
  expect(
    parseCodeFenceMeta(
      'filename="src/a b.tsx" line=18 title="A \\"quoted\\" title" commit=f58b8ee url=https://github.com/inkdropapp/example/blob/main/a.tsx#L18',
    ),
  ).toEqual({
    filename: 'src/a b.tsx',
    line: 18,
    title: 'A "quoted" title',
    commit: 'f58b8ee',
    url: 'https://github.com/inkdropapp/example/blob/main/a.tsx#L18',
  });
  expect(
    parseCodeFenceMeta(
      "title='Safe <img onerror=alert(1)>' line=0 url=javascript:alert(1) unknown=ignored",
    ),
  ).toEqual({ title: 'Safe <img onerror=alert(1)>' });
  for (const value of ['-1', '1.5', 'Infinity', '9007199254740992'])
    expect(parseCodeFenceMeta(`line=${value}`)).toEqual({});
});

it('renders the reference TSX header, numbered lines and exact source text', () => {
  const body =
    '```tsx filename="src/components/note-list-item.tsx" line=18 title="Memoize the row"\nexport const Item = () => <div>Hello</div>;\n// second line\n```';
  const { container } = preview(body);
  const block = container.querySelector('.codeblock')!;
  expect(block.getAttribute('data-source-start')).toBe('0');
  expect(block.getAttribute('data-source-end')).toBe(String(body.length));
  expect(block.querySelector('.codeblock-title')?.textContent).toBe(
    'Memoize the row',
  );
  expect(block.querySelector('.codeblock-filename')?.textContent).toBe(
    'src/components/note-list-item.tsx',
  );
  expect(block.querySelector('.codeblock-info')?.textContent).toContain('18');
  expect(block.querySelector('.codeblock-meta-icon svg')).toBeTruthy();
  expect(
    block.querySelector('.mde-preview-code-line-number')?.textContent,
  ).toBe('18\n19');
  expect(block.querySelector('code')?.textContent).toBe(
    'export const Item = () => <div>Hello</div>;\n// second line\n',
  );
  expect(block.querySelector('code .tok-module-keyword')?.textContent).toBe(
    'export',
  );
  expect(block.querySelector('code .tok-line-comment')?.textContent).toBe(
    '// second line',
  );
});

it('keeps plain, unknown and inline code readable without inventing a metadata header', () => {
  const { container } = preview(
    '`inline`\n\n```unknownlang\n<script>literal & safe</script>\n```\n\n```\nplain\n```',
  );
  expect(container.querySelectorAll('.codeblock-meta')).toHaveLength(0);
  expect(container.querySelectorAll('pre')).toHaveLength(2);
  expect(
    container.querySelector('code.language-unknownlang')?.textContent,
  ).toBe('<script>literal & safe</script>\n');
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('p code')?.textContent).toBe('inline');
});

it('loads non-JavaScript grammars lazily and preserves the code DOM while editing', async () => {
  const { container, rerender, store } = preview(
    '```python line=2\ndef greet(name):\n    return "Hello " + name\n```',
  );
  await waitFor(() =>
    expect(
      container.querySelector('code .tok-definition-keyword')?.textContent,
    ).toBe('def'),
  );
  const pre = container.querySelector('pre');
  rerender(
    <WorkspaceProvider store={store}>
      <MarkdownPreview
        body={
          '```python line=2\ndef greet(name):\n    return "Hi " + name\n```'
        }
      />
    </WorkspaceProvider>,
  );
  await waitFor(() =>
    expect(container.querySelector('code')?.textContent).toContain('"Hi "'),
  );
  expect(container.querySelector('pre')).toBe(pre);
  expect(
    container.querySelector('.mde-preview-code-line-number')?.textContent,
  ).toBe('2\n3');
});

it('loads an alias whose canonical language name contains spaces', async () => {
  const { container } = preview(
    '```lisp\n(defun greet (name) (print name))\n```',
  );
  await waitFor(() =>
    expect(
      container.querySelector('code.language-lisp span[class*="tok-"]'),
    ).toBeTruthy(),
  );
  expect(container.querySelector('code')?.textContent).toBe(
    '(defun greet (name) (print name))\n',
  );
});

it('escapes titles and filenames and only opens safe source URLs through the app action', async () => {
  const { container, store } = preview(
    '```json title="<script>literal</script>" filename="<img>.json" commit=abc123 line=9 url=https://github.com/example/repo/blob/abc123/file.json#L9\n{"enabled":true}\n```',
  );
  const open = vi.fn();
  act(() => store.setState({ openExternalLink: open }));
  const link = container.querySelector<HTMLAnchorElement>('.codeblock-info a')!;
  expect(link.href).toBe(
    'https://github.com/example/repo/blob/abc123/file.json#L9',
  );
  fireEvent.click(link);
  expect(open).toHaveBeenCalledWith(link.href);
  expect(container.querySelector('script, img')).toBeNull();
  expect(container.querySelector('.codeblock-title')?.textContent).toBe(
    '<script>literal</script>',
  );
  expect(container.querySelector('.codeblock-filename')?.textContent).toBe(
    '<img>.json',
  );
  cleanup();
  const unsafe = preview(
    '```json title="Safe" url=javascript:alert(1)\n{}\n```',
  );
  expect(unsafe.container.querySelector('.codeblock-meta a')).toBeNull();
});

it('keeps CRLF-normalized content and metadata stable when editing normalizes line endings', () => {
  const { container, rerender, store } = preview(
    '```json filename="config.json" line=5\r\n{\r\n  "ok":true\r\n}\r\n```',
  );
  const code = container.querySelector('code');
  expect(code?.textContent).toBe('{\n  "ok":true\n}\n');
  expect(
    container.querySelector('.mde-preview-code-line-number')?.textContent,
  ).toBe('5\n6\n7');
  rerender(
    <WorkspaceProvider store={store}>
      <MarkdownPreview
        body={'```json filename="config.json" line=5\n{\n  "ok":true\n}\n```'}
      />
    </WorkspaceProvider>,
  );
  expect(container.querySelector('code')).toBe(code);
});
