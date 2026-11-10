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
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { emptyLibrary } from '../../src/shared/library';
import type { LibrarySnapshot } from '../../src/shared/library';
import { success } from '../../src/shared/ipc';
import { createApi, firstNote, secondNote } from '../support/renderer-api';

afterEach(cleanup);

it('saves an open draft before moving the keyboard selection to Trash', async () => {
  let active = [firstNote, secondNote];
  let trashed: typeof active = [];
  const moved = vi.fn((ids: readonly string[]) => {
    const selected = active.filter((note) => ids.includes(note.id));
    trashed = selected.map((note) => ({ ...note, deletedAt: note.updatedAt }));
    active = active.filter((note) => !ids.includes(note.id));
    return success(selected.length);
  });
  const { api } = createApi({
    list: async ({ trashed: inTrash } = {}) =>
      success(inTrash ? trashed : active),
    update: async (input) => {
      const note = { ...firstNote, ...input, revision: firstNote.revision + 1 };
      active = active.map((value) => (value.id === note.id ? note : value));
      return success(note);
    },
    manageTrash: async (input) =>
      input.action === 'trash' ? moved(input.ids) : success(0),
  });
  api.library.get = async () =>
    success({ ...emptyLibrary, total: active.length, trash: trashed.length });
  const store = createWorkspaceStore(api);
  render(<App store={store} />);

  const first = await screen.findByRole('button', { name: /^First/ });
  fireEvent.click(first);
  act(() => store.getState().updateDraft({ body: 'Unsaved changes' }));
  const second = screen.getByRole('button', { name: /^Second/ });
  fireEvent.click(second, { ctrlKey: true });
  expect(
    screen.getByRole('heading', { name: '2 notas seleccionadas' }),
  ).toBeTruthy();
  fireEvent.keyDown(second, { key: 'Delete' });
  const dialog = screen.getByRole('dialog', { name: 'Mover a papelera' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  expect(moved).not.toHaveBeenCalled();

  fireEvent.click(
    within(screen.getByRole('main', { name: 'Notas seleccionadas' })).getByRole(
      'button',
      { name: 'Mover a papelera' },
    ),
  );
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Mover a papelera',
    }),
  );
  await waitFor(() =>
    expect(moved).toHaveBeenCalledWith([firstNote.id, secondNote.id]),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: /^Papelera/ }));
  await screen.findByRole('button', { name: /^First/ });
  expect(trashed.find(({ id }) => id === firstNote.id)?.body).toBe(
    'Unsaved changes',
  );
  expect(
    screen
      .getAllByRole('button', { name: 'Mover a notebook…' })
      .some((button) => button.closest('.note-trash-actions')),
  ).toBeTruthy();
});

it('edits a tag through its sidebar menu and retains the active filter after renaming', async () => {
  let tags: LibrarySnapshot['tags'] = [{ name: 'Work', count: 1 }];
  const { api } = createApi({ list: async () => success([firstNote]) });
  api.library.get = async () => success({ ...emptyLibrary, tags });
  api.library.updateTag = vi.fn(async (input) => {
    tags = [{ name: input.nextName, count: 1, color: input.color }];
    return success(true);
  });
  const store = createWorkspaceStore(api);
  render(<App store={store} />);
  const tag = await screen.findByRole('button', { name: /^Work\s*1$/ });
  fireEvent.click(tag);
  fireEvent.contextMenu(tag);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Editar etiqueta…' }));
  const dialog = screen.getByRole('dialog', { name: 'Editar etiqueta' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), {
    target: { value: 'Projects' },
  });
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Color' }), {
    target: { value: 'violet' },
  });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Guardar cambios' }),
  );
  const renamed = await screen.findByRole('button', { name: /^Projects\s*1$/ });
  expect(api.library.updateTag).toHaveBeenCalledWith({
    name: 'Work',
    nextName: 'Projects',
    color: 'violet',
  });
  expect(renamed.querySelector('.tag-color-violet')).toBeTruthy();
  expect(store.getState().navigation).toEqual({
    type: 'tag',
    name: 'Projects',
  });
});
