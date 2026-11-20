// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { IntegrationSettings } from '../../src/renderer/components/integration-settings';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { emptyLibrary } from '../../src/shared/library';
import { success } from '../../src/shared/ipc';
import { createApi } from '../support/renderer-api';

afterEach(cleanup);

const work = '0c1f8f7e-3c1a-4a59-9a2b-6b2f1c9d4e01';
const sub = '0c1f8f7e-3c1a-4a59-9a2b-6b2f1c9d4e02';

it('limits apps and agents to one notebook or one tag', async () => {
  const { api } = createApi();
  api.library.get = async () =>
    success({
      ...emptyLibrary,
      notebooks: [
        {
          id: work,
          name: 'Trabajo',
          parentId: null,
          count: 1,
          descendantCount: 1,
          icon: 'book-open',
        },
        {
          id: sub,
          name: 'Clientes',
          parentId: work,
          count: 1,
          descendantCount: 0,
          icon: 'book-open',
        },
      ],
      tags: [{ name: 'claude', count: 2 }],
    });
  const store = createWorkspaceStore(api);
  await store.getState().refreshLibrary();
  render(
    <WorkspaceProvider store={store}>
      <IntegrationSettings />
    </WorkspaceProvider>,
  );
  const scope = screen.getByRole('combobox', { name: 'Notas accesibles' });
  expect((scope as HTMLSelectElement).value).toBe('all');

  fireEvent.change(scope, { target: { value: 'notebook' } });
  const notebook = await screen.findByRole('combobox', {
    name: 'Notebook accesible',
  });
  expect(
    [...(notebook as HTMLSelectElement).options].map((option) => option.text),
  ).toEqual(['Trabajo', 'Trabajo › Clientes']);
  fireEvent.change(notebook, { target: { value: sub } });
  expect(store.getState().preferences.localApiScope).toEqual({
    type: 'notebook',
    notebookId: sub,
  });

  fireEvent.change(scope, { target: { value: 'tag' } });
  expect(store.getState().preferences.localApiScope).toEqual({
    type: 'tag',
    tag: 'claude',
  });

  fireEvent.change(scope, { target: { value: 'all' } });
  expect(store.getState().preferences.localApiScope).toEqual({ type: 'all' });
});
