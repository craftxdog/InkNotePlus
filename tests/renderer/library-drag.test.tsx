// @vitest-environment jsdom
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NoteList } from '../../src/renderer/components/note-list';
import { Sidebar } from '../../src/renderer/components/sidebar';
import { LibraryActionDialog } from '../../src/renderer/components/library-action-dialog';
import {
  WorkspaceProvider,
  useWorkspace,
} from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success } from '../../src/shared/ipc';
import { emptyLibrary, type Notebook } from '../../src/shared/library';
import { createApi, firstNote, secondNote } from '../support/renderer-api';

afterEach(cleanup);
const workId = '7a5115f8-747f-416d-82d5-d9c12e34d323';
const homeId = '8a5115f8-747f-416d-82d5-d9c12e34d323';
const book = (id: string, name: string): Notebook => ({
  id,
  name,
  parentId: null,
  icon: 'book-open',
  count: 0,
  descendantCount: 0,
});
const transfer = () => {
  const data = new Map<string, string>();
  return {
    effectAllowed: '',
    dropEffect: '',
    types: [] as string[],
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
  };
};
function Dialog() {
  const request = useWorkspace((state) => state.libraryDialog);
  return request ? <LibraryActionDialog request={request} /> : null;
}
async function mount() {
  const manageTrash = vi.fn(async () => success(1));
  const bridge = createApi({
    list: async () => success([firstNote, secondNote]),
    manageTrash,
  });
  const moveNotebook = vi.fn(async () => success(true));
  const renameNotebook = vi.fn(async () => success(true));
  bridge.api.library.moveNotebook = moveNotebook;
  bridge.api.library.renameNotebook = renameNotebook;
  const library = {
    ...emptyLibrary,
    notebooks: [book(workId, 'Trabajo'), book(homeId, 'Casa')],
  };
  bridge.api.library.get = async () => success(library);
  const store = createWorkspaceStore(bridge.api);
  await store.getState().refreshNotes();
  await waitFor(() =>
    expect(store.getState().library.notebooks).toHaveLength(2),
  );
  render(
    <WorkspaceProvider store={store}>
      <Sidebar onNavigate={() => {}} onClose={() => {}} />
      <NoteList onToggleSidebar={() => {}} onOpenNote={() => {}} />
      <Dialog />
    </WorkspaceProvider>,
  );
  return { store, manageTrash, moveNotebook, renameNotebook };
}
const noteRow = (title: string) =>
  screen.getByText(title, { selector: '.note-row-title' }).closest('button')!;
const notebookRow = (name: string) =>
  screen
    .getByText(name, { selector: '.navigation-label' })
    .closest('.notebook-row')!;
const rowRect = (row: Element) => {
  row.getBoundingClientRect = () => ({
    top: 0,
    height: 40,
    bottom: 40,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
};
// jsdom has no DragEvent, so pointer coordinates must be set by hand.
function dragAt(
  type: 'dragOver' | 'drop',
  target: Element,
  dataTransfer: ReturnType<typeof transfer>,
  clientY: number,
) {
  const event = createEvent[type](target, { dataTransfer });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(target, event);
}
function drag(source: Element, target: Element, clientY = 20) {
  const dataTransfer = transfer();
  rowRect(target);
  fireEvent.dragStart(source, { dataTransfer });
  dragAt('dragOver', target, dataTransfer, clientY);
  const zone = target.getAttribute('data-drop');
  dragAt('drop', target, dataTransfer, clientY);
  fireEvent.dragEnd(source, { dataTransfer });
  return zone;
}

it('moves a dragged note into the notebook under the pointer', async () => {
  const { manageTrash } = await mount();
  expect(drag(noteRow('Second'), notebookRow('Casa'))).toBe('inside');
  await waitFor(() =>
    expect(manageTrash).toHaveBeenCalledWith({
      action: 'move',
      ids: [secondNote.id],
      notebookId: homeId,
    }),
  );
});

it('moves the whole selection when dragging a selected note', async () => {
  const { store, manageTrash } = await mount();
  act(() => store.setState({ selectedNoteIds: [firstNote.id, secondNote.id] }));
  drag(noteRow('First'), notebookRow('Trabajo'));
  await waitFor(() =>
    expect(manageTrash).toHaveBeenCalledWith({
      action: 'move',
      ids: [firstNote.id, secondNote.id],
      notebookId: workId,
    }),
  );
});

it('moves dragged notes out of every notebook through Sin notebook', async () => {
  const { manageTrash } = await mount();
  const target = screen
    .getByText('Sin notebook')
    .closest('[data-note-drop-target]')!;
  drag(noteRow('First'), target);
  await waitFor(() =>
    expect(manageTrash).toHaveBeenCalledWith({
      action: 'move',
      ids: [firstNote.id],
      notebookId: null,
    }),
  );
});

it('reorders notebooks from the row edges and nests from its center', async () => {
  const { moveNotebook } = await mount();
  expect(drag(notebookRow('Casa'), notebookRow('Trabajo'), 2)).toBe('before');
  await waitFor(() =>
    expect(moveNotebook).toHaveBeenLastCalledWith({
      id: homeId,
      parentId: null,
      beforeId: workId,
    }),
  );
  expect(drag(notebookRow('Casa'), notebookRow('Trabajo'), 20)).toBe('inside');
  await waitFor(() =>
    expect(moveNotebook).toHaveBeenLastCalledWith({
      id: homeId,
      parentId: workId,
      beforeId: null,
    }),
  );
});

it('ignores a notebook dropped on itself and foreign drags', async () => {
  const { moveNotebook, manageTrash } = await mount();
  expect(drag(notebookRow('Casa'), notebookRow('Casa'))).toBeNull();
  const target = notebookRow('Trabajo');
  rowRect(target);
  dragAt('dragOver', target, transfer(), 20);
  expect(target.getAttribute('data-drop')).toBeNull();
  dragAt('drop', target, transfer(), 20);
  expect(moveNotebook).not.toHaveBeenCalled();
  expect(manageTrash).not.toHaveBeenCalled();
});

it('does not offer dragging from Trash', async () => {
  const { store } = await mount();
  await store.getState().navigate({ type: 'trash' });
  await waitFor(() =>
    expect(noteRow('First').getAttribute('draggable')).toBe('false'),
  );
});

it('renames and moves a notebook from its context menu', async () => {
  const { renameNotebook, moveNotebook } = await mount();
  fireEvent.contextMenu(notebookRow('Casa'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Renombrar…' }));
  const rename = screen.getByRole('dialog', { name: 'Renombrar notebook' });
  fireEvent.change(within(rename).getByLabelText('Nombre'), {
    target: { value: '  Hogar ' },
  });
  fireEvent.click(
    within(rename).getByRole('button', { name: 'Guardar cambios' }),
  );
  await waitFor(() =>
    expect(renameNotebook).toHaveBeenCalledWith({ id: homeId, name: 'Hogar' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  fireEvent.contextMenu(notebookRow('Casa'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mover a…' }));
  const dialog = screen.getByRole('dialog', { name: 'Mover notebook' });
  const select = within(dialog).getByLabelText(
    'Dentro de',
  ) as HTMLSelectElement;
  expect([...select.options].map(({ text }) => text)).toEqual([
    'Biblioteca',
    'Trabajo',
  ]);
  fireEvent.change(select, { target: { value: workId } });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Mover notebook' }),
  );
  await waitFor(() =>
    expect(moveNotebook).toHaveBeenCalledWith({
      id: homeId,
      parentId: workId,
      beforeId: null,
    }),
  );
});

it('moves a notebook one step from its context menu', async () => {
  const { moveNotebook } = await mount();
  fireEvent.contextMenu(notebookRow('Trabajo'));
  expect(screen.queryByRole('menuitem', { name: 'Subir' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Bajar' }));
  await waitFor(() =>
    expect(moveNotebook).toHaveBeenCalledWith({
      id: workId,
      parentId: null,
      beforeId: null,
    }),
  );
});
