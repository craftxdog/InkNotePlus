// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownPreview } from '../../src/renderer/editor/markdown-preview';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi } from '../support/renderer-api';

vi.mock('../../src/renderer/editor/mermaid-diagram', () => ({
  default: ({ code }: { code: string }) => <div data-diagram-code={code} />,
}));
afterEach(cleanup);

it('keeps diagram source unchanged when the first edit normalizes a CRLF note', async () => {
  const { api } = createApi();
  const store = createWorkspaceStore(api);
  const body = '```mermaid\r\nflowchart TD\r\n A --> B\r\n```\r\n\r\nParagraph';
  const preview = (body: string) => (
    <WorkspaceProvider store={store}>
      <MarkdownPreview body={body} />
    </WorkspaceProvider>
  );
  const { container, rerender } = render(preview(body));
  await waitFor(() =>
    expect(container.querySelector('[data-diagram-code]')).not.toBeNull(),
  );
  const code = container
    .querySelector('[data-diagram-code]')!
    .getAttribute('data-diagram-code');
  rerender(preview(body.replace(/\r\n/g, '\n') + ' edited'));
  await waitFor(() =>
    expect(container.textContent).toContain('Paragraph edited'),
  );
  expect(
    container
      .querySelector('[data-diagram-code]')!
      .getAttribute('data-diagram-code'),
  ).toBe(code);
});
