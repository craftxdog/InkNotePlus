// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryActionDialog } from '../../src/renderer/components/library-action-dialog';
import { NoteList } from '../../src/renderer/components/note-list';
import { executeShortcut } from '../../src/renderer/shortcuts';
import {
  activeListFilter,
  metadataForNewNote,
} from '../../src/renderer/state/library-actions';
import {
  WorkspaceProvider,
  useWorkspace,
} from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success, type ListNotesInput } from '../../src/shared/ipc';
import { emptyLibrary } from '../../src/shared/library';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';
import { createApi, firstNote, secondNote } from '../support/renderer-api';

afterEach(cleanup);
const notes = [
  {
    ...firstNote,
    metadata: { ...defaultNoteMetadata, tags: ['alfa', 'beta'] },
  },
  { ...secondNote, metadata: { ...defaultNoteMetadata, tags: ['beta'] } },
];
function Dialog() {
  const request = useWorkspace((state) => state.libraryDialog);
  return request ? <LibraryActionDialog request={request} /> : null;
}
async function mount() {
  const list = vi.fn(async (_input: ListNotesInput = {}) => success(notes));
  const manageTrash = vi.fn(async () => success(2));
  const { api } = createApi({ list, manageTrash });
  api.library.get = async () =>
    success({
      ...emptyLibrary,
      tags: [
        { name: 'alfa', count: 1 },
        { name: 'beta', count: 2 },
      ],
    });
  const store = createWorkspaceStore(api);
  await store.getState().refreshNotes();
  render(
    <WorkspaceProvider store={store}>
      <NoteList onToggleSidebar={() => {}} onOpenNote={() => {}} />
      <Dialog />
    </WorkspaceProvider>,
  );
  await screen.findByText('First');
  return { store, list, manageTrash };
}
const lastFilter = (list: ReturnType<typeof vi.fn>) =>
  list.mock.calls.at(-1)?.[0] as ListNotesInput;
const rowTag = (title: string, tag: string) =>
  within(
    screen.getByText(title, { selector: '.note-row-title' }).closest('button')!,
  ).getByText(tag);
const menu = (title: string) =>
  fireEvent.contextMenu(
    screen.getByText(title, { selector: '.note-row-title' }).closest('button')!,
  );

describe('tag filter', () => {
  it('narrows the list with each clicked tag and shows removable chips', async () => {
    const { store, list } = await mount();
    fireEvent.click(rowTag('First', 'alfa'));
    await waitFor(() => expect(lastFilter(list).tags).toEqual(['alfa']));
    fireEvent.click(rowTag('First', 'beta'));
    await waitFor(() =>
      expect(lastFilter(list).tags).toEqual(['alfa', 'beta']),
    );
    expect(store.getState().activeNoteId).toBe(firstNote.id);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro alfa' }));
    await waitFor(() => expect(lastFilter(list).tags).toEqual(['beta']));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtro' }));
    await waitFor(() => expect(lastFilter(list).tags).toBeUndefined());
  });
  it('keeps only the clicked tag with Alt', async () => {
    const { list } = await mount();
    fireEvent.click(rowTag('First', 'alfa'));
    await waitFor(() => expect(lastFilter(list).tags).toEqual(['alfa']));
    fireEvent.click(rowTag('Second', 'beta'), { altKey: true });
    await waitFor(() => expect(lastFilter(list).tags).toEqual(['beta']));
  });
  it('clears when leaving the view and follows tag renames', async () => {
    const { store } = await mount();
    await act(() => store.getState().setTagFilter(['alfa', 'beta']));
    store.getState().renameTagFilter('alfa', 'gamma');
    expect(store.getState().tagFilter).toEqual(['gamma', 'beta']);
    store.getState().renameTagFilter('beta', null);
    expect(store.getState().tagFilter).toEqual(['gamma']);
    await act(() => store.getState().navigate({ type: 'trash' }));
    expect(store.getState().tagFilter).toEqual([]);
  });
  it('applies to global search and tags new notes so they stay visible', () => {
    const state = {
      navigation: { type: 'all' },
      preferences: createWorkspaceStore(createApi().api).getState().preferences,
      searchGlobal: true,
      tagFilter: ['alfa'],
    } as const;
    expect(activeListFilter(state).tags).toEqual(['alfa']);
    expect(
      metadataForNewNote({ type: 'tag', name: 'beta' }, undefined, ['alfa'])
        .tags,
    ).toEqual(['beta', 'alfa']);
  });
});

describe('note ordering controls', () => {
  it('offers every field and direction and keeps a natural default', async () => {
    const { store, list } = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Fecha de creación' }));
    await waitFor(() => expect(lastFilter(list).sort).toBe('created-desc'));
    fireEvent.click(screen.getByRole('button', { name: 'Ascendente' }));
    await waitFor(() => expect(lastFilter(list).sort).toBe('created-asc'));
    fireEvent.click(screen.getByRole('button', { name: 'Título' }));
    await waitFor(() => expect(lastFilter(list).sort).toBe('title-asc'));
    fireEvent.click(screen.getByRole('button', { name: 'Descendente' }));
    await waitFor(() =>
      expect(store.getState().preferences.noteSort).toBe('title-desc'),
    );
  });
  it('exposes the documented Inkdrop sort commands', async () => {
    const { store, list } = await mount();
    executeShortcut(store, 'view:sort-by-date-created-in-asc', null);
    await waitFor(() => expect(lastFilter(list).sort).toBe('created-asc'));
    executeShortcut(store, 'view:sort-by-title-in-desc', null);
    await waitFor(() => expect(lastFilter(list).sort).toBe('title-desc'));
  });
});

describe('bulk actions', () => {
  const select = (store: Awaited<ReturnType<typeof mount>>['store']) =>
    act(() => store.setState({ selectedNoteIds: notes.map(({ id }) => id) }));
  const ids = notes.map(({ id }) => id);

  it('changes the status of the selection', async () => {
    const { store, manageTrash } = await mount();
    select(store);
    menu('First');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cambiar estado…' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambiar estado' });
    fireEvent.change(within(dialog).getByLabelText('Estado'), {
      target: { value: 'completed' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));
    await waitFor(() =>
      expect(manageTrash).toHaveBeenCalledWith({
        action: 'status',
        ids,
        status: 'completed',
      }),
    );
    await waitFor(() => expect(store.getState().selectedNoteIds).toEqual([]));
  });
  it('adds typed tags and removes checked ones', async () => {
    const { store, manageTrash } = await mount();
    select(store);
    menu('First');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Etiquetar…' }));
    const dialog = screen.getByRole('dialog', { name: 'Etiquetar notas' });
    const apply = within(dialog).getByRole('button', { name: 'Aplicar' });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Añadir etiquetas'), {
      target: { value: ' uno, dos ,uno' },
    });
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Quitar alfa' }),
    );
    fireEvent.click(apply);
    await waitFor(() =>
      expect(manageTrash).toHaveBeenCalledWith({
        action: 'tag',
        ids,
        add: ['uno', 'dos'],
        remove: ['alfa'],
      }),
    );
  });
  it('moves the selection to a notebook', async () => {
    const { store, manageTrash } = await mount();
    select(store);
    menu('First');
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Mover a notebook…' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Mover a notebook' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(manageTrash).toHaveBeenCalledWith({
        action: 'move',
        ids,
        notebookId: null,
      }),
    );
  });
  it('explains when a note would exceed the tag limit', async () => {
    const { store, manageTrash } = await mount();
    manageTrash.mockResolvedValueOnce({
      ok: false,
      error: { code: 'conflict' },
    } as never);
    select(store);
    menu('First');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Etiquetar…' }));
    const dialog = screen.getByRole('dialog', { name: 'Etiquetar notas' });
    fireEvent.change(within(dialog).getByLabelText('Añadir etiquetas'), {
      target: { value: 'extra' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      '32 etiquetas',
    );
  });
});
