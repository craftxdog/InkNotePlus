// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Sidebar } from '../../src/renderer/components/sidebar';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { emptyLibrary } from '../../src/shared/library';
import { createApi } from '../support/renderer-api';

afterEach(cleanup);
const workId = '7a5115f8-747f-416d-82d5-d9c12e34d323';
const projectsId = '8a5115f8-747f-416d-82d5-d9c12e34d323';

function mount() {
  const store = createWorkspaceStore(createApi().api);
  store.setState({
    library: {
      ...emptyLibrary,
      unfiled: 2,
      notebooks: [
        {
          id: projectsId,
          name: 'Proyectos',
          parentId: workId,
          icon: 'rocket',
          count: 3,
          descendantCount: 3,
        },
        {
          id: workId,
          name: 'Trabajo',
          parentId: null,
          icon: 'briefcase',
          count: 0,
          descendantCount: 3,
        },
      ],
    },
    preferences: {
      ...store.getState().preferences,
      showNoteCounts: true,
      expandedNotebookIds: [],
    },
  });
  render(
    <WorkspaceProvider store={store}>
      <Sidebar onNavigate={() => {}} onClose={() => {}} />
    </WorkspaceProvider>,
  );
  return store;
}

it('uses direct and subtree counts consistently when expanding notebooks', async () => {
  mount();
  const work = screen.getByRole('button', { name: /^Trabajo\s*3$/ });
  expect(screen.queryByText('Proyectos')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Expandir Trabajo' }));
  await screen.findByRole('button', { name: 'Contraer Trabajo' });
  expect(work.textContent).toBe('Trabajo0');
  expect(screen.getByRole('button', { name: /^Proyectos\s*3$/ })).toBeTruthy();
});

it('searches collapsed subnotebooks without changing saved expansion or navigation', async () => {
  const store = mount();
  const section = screen.getByRole('region', { name: 'Notebooks' });
  fireEvent.click(
    within(section).getByRole('button', { name: 'Filtrar notebooks' }),
  );
  const input = screen.getByRole('textbox', {
    name: 'Buscar notebooks en la biblioteca',
  });
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: 'proyectos' } });
  expect(screen.getByText('Proyectos')).toBeTruthy();
  expect(screen.getByText('Trabajo')).toBeTruthy();
  expect(within(section).queryByText('Sin notebook')).toBeNull();
  expect(store.getState().preferences.expandedNotebookIds).toEqual([]);
  expect(store.getState().navigation).toEqual({ type: 'all' });
  fireEvent.change(input, { target: { value: 'Sin notebook' } });
  expect(within(section).getByText('Sin notebook')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.change(input, { target: { value: 'missing' } });
  expect(screen.getByRole('status').textContent).toContain(
    'No se encontraron notebooks',
  );
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByText('Proyectos')).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Filtrar notebooks' }),
  );
  expect(screen.getByText('Sin notebook')).toBeTruthy();
});
