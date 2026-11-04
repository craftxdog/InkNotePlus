// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MarkdownPreview } from '../../src/renderer/editor/markdown-preview';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi } from '../support/renderer-api';

afterEach(cleanup);

it('renders inline, display and fenced math without interpreting ordinary code or raw HTML', async () => {
  const { api } = createApi();
  const { container } = render(
    <WorkspaceProvider store={createWorkspaceStore(api)}>
      <MarkdownPreview
        body={
          'Inline $O(n \\times m)$ and `$literal$`.\n\n$$\n\\frac{n}{v} \\approx 127\n$$\n\n```math\n\\sum_{i=1}^{n} i\n```\n\n<script>bad()</script>'
        }
      />
    </WorkspaceProvider>,
  );
  await waitFor(() =>
    expect(container.querySelectorAll('.inkdrop-math math')).toHaveLength(3),
  );
  expect(container.querySelector('code')?.textContent).toBe('$literal$');
  expect(container.querySelector('script')).toBeNull();
  expect(
    container.querySelector('.math-block[data-source-start]'),
  ).not.toBeNull();
});

it('contains an invalid formula and denies trusted HTML commands', async () => {
  const { api } = createApi();
  const { container } = render(
    <WorkspaceProvider store={createWorkspaceStore(api)}>
      <MarkdownPreview
        body={'$\\notACommand{x}$\n\n$\\href{javascript:alert(1)}{bad}$'}
      />
    </WorkspaceProvider>,
  );
  await waitFor(() =>
    expect(container.querySelector('.inkdrop-math-error')).not.toBeNull(),
  );
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
});
