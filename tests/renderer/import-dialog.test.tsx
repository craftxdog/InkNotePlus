// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LibraryActionDialog } from '../../src/renderer/components/library-action-dialog';
import {
  WorkspaceProvider,
  useWorkspace,
} from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { failure, success } from '../../src/shared/ipc';
import type { ImportSummary } from '../../src/shared/transfer';
import { createApi, firstNote } from '../support/renderer-api';

afterEach(cleanup);
function Dialog() {
  const request = useWorkspace((state) => state.libraryDialog);
  return request ? <LibraryActionDialog request={request} /> : null;
}
function setup(
  result: Awaited<
    ReturnType<ReturnType<typeof createApi>['api']['transfer']['importNotes']>
  >,
) {
  const list = vi.fn(async () => success([firstNote]));
  const { api } = createApi({ list });
  const importNotes = vi.fn(async () => result);
  api.transfer.importNotes = importNotes;
  const store = createWorkspaceStore(api);
  render(
    <WorkspaceProvider store={store}>
      <Dialog />
    </WorkspaceProvider>,
  );
  return { store, importNotes, list };
}
const summary: ImportSummary = {
  notes: 3,
  notebooks: 1,
  images: 2,
  missingImages: 1,
  skipped: 1,
};

it('reports what was imported and refreshes the list', async () => {
  const { store, importNotes, list } = setup(success(summary));
  await store.getState().importNotes('folder', firstNote.id);
  expect(importNotes).toHaveBeenCalledWith({
    kind: 'folder',
    notebookId: firstNote.id,
  });
  expect(list).toHaveBeenCalled();
  const dialog = await screen.findByRole('dialog', {
    name: 'Importación completada',
  });
  expect(dialog.textContent).toContain(
    '3 notas · 1 notebook nuevo · 2 imágenes',
  );
  expect(dialog.textContent).toContain('1 adjuntos sin importar');
  expect(dialog.textContent).toContain('1 archivos omitidos');
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
  await waitFor(() => expect(store.getState().libraryDialog).toBeNull());
});

it('stays quiet when the picker is cancelled', async () => {
  const { store } = setup(success(null));
  await store.getState().importNotes('files');
  expect(store.getState().libraryDialog).toBeNull();
});

it('explains a failed import', async () => {
  const { store } = setup(failure('unavailable'));
  await store.getState().importNotes('files');
  expect(
    await screen.findByRole('dialog', { name: 'No se pudo importar' }),
  ).toBeTruthy();
});
