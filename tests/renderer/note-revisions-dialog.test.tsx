// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NoteRevisionsDialog } from '../../src/renderer/components/note-revisions-dialog';
import { executeShortcut } from '../../src/renderer/shortcuts';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success, type NoteProjection } from '../../src/shared/ipc';
import { createApi, firstNote } from '../support/renderer-api';

afterEach(cleanup);
const versions = {
  3: {
    revision: 3,
    title: 'Actual',
    body: 'uno\nnuevo',
    createdAt: '2026-11-03T10:00:00.000Z',
  },
  2: {
    revision: 2,
    title: 'Antiguo',
    body: 'uno\nviejo',
    createdAt: '2026-11-02T10:00:00.000Z',
  },
} as const;

async function mount() {
  let note: NoteProjection = {
    ...firstNote,
    title: 'Actual',
    body: 'uno\nnuevo',
    revision: 3,
  };
  const update = vi.fn(
    async (input: {
      title: string;
      body: string;
      expectedRevision: number;
    }) => {
      note = {
        ...note,
        title: input.title,
        body: input.body,
        revision: input.expectedRevision + 1,
      };
      return success(note);
    },
  );
  const { api } = createApi({
    list: async () => success([note]),
    update: update as never,
    listRevisions: async () =>
      success([
        {
          revision: 3,
          title: 'Actual',
          createdAt: versions[3].createdAt,
          current: true,
        },
        {
          revision: 2,
          title: 'Antiguo',
          createdAt: versions[2].createdAt,
          current: false,
        },
      ]),
    getRevision: async ({ revision }) => success(versions[revision as 2 | 3]),
  });
  const store = createWorkspaceStore(api);
  await store.getState().refreshNotes();
  store.getState().selectNote(note.id);
  render(
    <WorkspaceProvider store={store}>
      <NoteRevisionsDialog />
    </WorkspaceProvider>,
  );
  await screen.findByRole('dialog', { name: 'Historial de revisiones' });
  return { store, update };
}

it('compares the previous version with the current note', async () => {
  await mount();
  const diff = await screen.findByRole('list', {
    name: 'Cambios de esta versión',
  });
  await waitFor(() => expect(within(diff).getByText('viejo')).toBeTruthy());
  expect(within(diff).getByText('viejo').closest('li')?.dataset.diff).toBe(
    'removed',
  );
  expect(within(diff).getByText('nuevo').closest('li')?.dataset.diff).toBe(
    'added',
  );
  expect(
    screen
      .getByRole('button', { name: /Antiguo/ })
      .getAttribute('aria-current'),
  ).toBe('true');
});

it('restores a version and can undo the restoration', async () => {
  const { store, update } = await mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Restaurar esta versión' }),
  );
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Antiguo',
        body: 'uno\nviejo',
        expectedRevision: 3,
      }),
    ),
  );
  await waitFor(() =>
    expect(store.getState().document.body).toBe('uno\nviejo'),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Deshacer restauración' }),
  );
  await waitFor(() =>
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Actual',
        body: 'uno\nnuevo',
        expectedRevision: 4,
      }),
    ),
  );
});

it('does not offer restoring the current version', async () => {
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: /Actual/ }));
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Restaurar esta versión' }),
    ).toBeNull(),
  );
});

it('opens from its command unless the note is in Trash', () => {
  const store = createWorkspaceStore(createApi().api);
  expect(executeShortcut(store, 'core:show-note-revisions', null)).toBe(false);
  store.setState((state) => ({
    document: { ...state.document, noteId: firstNote.id },
  }));
  expect(executeShortcut(store, 'core:show-note-revisions', null)).toBe(true);
  expect(store.getState().revisionsOpen).toBe(true);
});
