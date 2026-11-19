// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type * as Presentation from '../../src/renderer/editor/markdown-presentation';

const renders = vi.hoisted(() => ({ code: 0 }));
vi.mock('../../src/renderer/editor/markdown-presentation', async (original) => {
  const module = await original<typeof Presentation>();
  return {
    ...module,
    FencedCodeBlock: (props: Parameters<typeof module.FencedCodeBlock>[0]) => {
      renders.code++;
      return module.FencedCodeBlock(props);
    },
  };
});

const { MarkdownPreview } =
  await import('../../src/renderer/editor/markdown-preview');
const { WorkspaceProvider } =
  await import('../../src/renderer/state/workspace-context');
const { createWorkspaceStore } =
  await import('../../src/renderer/state/workspace-store');
const { createApi } = await import('../support/renderer-api');

afterEach(cleanup);

it('does not re-render code blocks while another block is edited', () => {
  const store = createWorkspaceStore(createApi().api);
  const view = (body: string) => (
    <WorkspaceProvider store={store}>
      <MarkdownPreview body={body} />
    </WorkspaceProvider>
  );
  const code = '\n\n```ts\nconst a = 1;\n```\n';
  const { rerender } = render(view(`Para${code}`));
  const mounted = renders.code;
  expect(mounted).toBeGreaterThan(0);
  for (const text of ['Para 1', 'Para 12', 'Para 123'])
    act(() => rerender(view(`${text}${code}`)));
  expect(renders.code).toBe(mounted);
});
