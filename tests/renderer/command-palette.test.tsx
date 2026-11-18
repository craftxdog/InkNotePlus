// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '../../src/renderer/components/command-palette';
import { jumpToNoteLine } from '../../src/renderer/editor/note-navigation';
import { executeShortcut } from '../../src/renderer/shortcuts';
import { WorkspaceProvider } from '../../src/renderer/state/workspace-context';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { success } from '../../src/shared/ipc';
import { emptyLibrary, type Notebook } from '../../src/shared/library';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';
import { createApi, firstNote } from '../support/renderer-api';

vi.mock('../../src/renderer/editor/note-navigation', () => ({
  jumpToNoteLine: vi.fn(() => true),
}));
afterEach(() => {
  cleanup();
  vi.mocked(jumpToNoteLine).mockClear();
});
const bookId = '7a5115f8-747f-416d-82d5-d9c12e34d323';
const childId = '8a5115f8-747f-416d-82d5-d9c12e34d323';
const book = (id: string, name: string, parentId: string | null): Notebook => ({
  id,
  name,
  parentId,
  icon: 'book-open',
  count: 0,
  descendantCount: 0,
});
const note = {
  ...firstNote,
  body: '# Introducción\n\n- [ ] Revisar datos\n',
  metadata: { ...defaultNoteMetadata, tags: ['alfa'] },
};

async function mount(query = '') {
  const manageTrash = vi.fn(async () => success(1));
  const update = vi.fn(async (input: { expectedRevision: number }) =>
    success({ ...note, ...input, revision: 2 }),
  );
  const { api } = createApi({
    list: async () => success([note]),
    manageTrash,
    update: update as never,
  });
  const library = {
    ...emptyLibrary,
    notebooks: [book(bookId, 'Trabajo', null), book(childId, 'Web', bookId)],
    tags: [
      { name: 'alfa', count: 1 },
      { name: 'urgente', count: 2 },
    ],
  };
  api.library.get = async () => success(library);
  const store = createWorkspaceStore(api);
  await store.getState().refreshNotes();
  await waitFor(() => expect(store.getState().library.tags).toHaveLength(2));
  store.getState().selectNote(note.id);
  store.getState().setCommandPaletteOpen(true, query);
  render(
    <WorkspaceProvider store={store}>
      <CommandPalette />
    </WorkspaceProvider>,
  );
  return { store, manageTrash, update };
}
const input = () => screen.getByRole('combobox') as HTMLInputElement;
const type = (value: string) =>
  fireEvent.change(input(), { target: { value } });
const labels = () =>
  screen
    .getAllByRole('option')
    .map((option) => option.querySelector('span')!.firstChild!.textContent);
const press = (init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(input(), { key: 'Enter', ...init });

describe('palette sources', () => {
  it('limits results to the source of each prefix', async () => {
    await mount();
    type('b ');
    expect(labels()).toEqual(['Trabajo', 'Web']);
    type('b web');
    expect(labels()).toEqual(['Web']);
    expect(screen.getByRole('option').textContent).toContain('Trabajo : Web');
    type('t ');
    expect(labels()).toEqual(['alfa', 'urgente']);
    type('# ');
    expect(labels()).toEqual(['Introducción', 'Revisar datos']);
    type('h kanagawa dragon');
    expect(labels()).toEqual(['Kanagawa Dragon']);
    type('> nueva nota');
    expect(labels()[0]).toBe('Nueva nota');
  });
  it('searches every source without a prefix', async () => {
    await mount();
    type('urgente');
    expect(labels()[0]).toBe('urgente');
    type('Trabajo');
    expect(labels()[0]).toBe('Trabajo');
    type('Introducción');
    expect(labels()[0]).toBe('Introducción');
  });
  it('opens scoped from its documented commands', async () => {
    const { store } = await mount();
    for (const [command, prefix] of [
      ['core:telescope-notebooks', 'b '],
      ['core:telescope-tags', 't '],
      ['core:telescope-commands', '> '],
      ['telescope-toc:show', '# '],
      ['telescope-themes:show', 'h '],
    ] as const) {
      executeShortcut(store, command, null);
      expect(store.getState().commandPaletteQuery).toBe(prefix);
    }
  });
});

describe('palette actions', () => {
  it('opens a notebook, its workspace or moves the note into it', async () => {
    const { store, manageTrash } = await mount('b web');
    press();
    await waitFor(() =>
      expect(store.getState().navigation).toEqual({
        type: 'notebook',
        id: childId,
      }),
    );
    expect(store.getState().commandPaletteOpen).toBe(false);
    cleanup();

    const workspace = await mount('b web');
    press({ ctrlKey: true });
    await waitFor(() =>
      expect(workspace.store.getState().preferences.notebookScopeId).toBe(
        childId,
      ),
    );
    cleanup();

    const moving = await mount('b web');
    press({ shiftKey: true });
    await waitFor(() =>
      expect(moving.manageTrash).toHaveBeenCalledWith({
        action: 'move',
        ids: [note.id],
        notebookId: childId,
      }),
    );
    expect(manageTrash).not.toHaveBeenCalled();
  });
  it('shows a tag, adds it to the filter or tags the open note', async () => {
    const { store } = await mount('t urgente');
    press();
    await waitFor(() =>
      expect(store.getState().navigation).toEqual({
        type: 'tag',
        name: 'urgente',
      }),
    );
    cleanup();

    const filtering = await mount('t urgente');
    press({ ctrlKey: true });
    await waitFor(() =>
      expect(filtering.store.getState().tagFilter).toEqual(['urgente']),
    );
    cleanup();

    const tagging = await mount('t urgente');
    press({ shiftKey: true });
    await waitFor(() =>
      expect(tagging.update).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ tags: ['alfa', 'urgente'] }),
        }),
      ),
    );
  });
  it('jumps to a heading of the open note', async () => {
    await mount('# revisar');
    press();
    await waitFor(() => expect(jumpToNoteLine).toHaveBeenCalledWith(3));
  });
  it('applies a theme', async () => {
    const { store } = await mount('h solarized dark');
    press();
    await waitFor(() =>
      expect(store.getState().preferences.theme).toBe('solarized-dark'),
    );
  });
  it('explains the actions of the highlighted result', async () => {
    await mount('b trabajo');
    const hints = screen.getByRole('status', { name: 'Acciones disponibles' });
    expect(hints.textContent).toContain('Abrir');
    expect(hints.textContent).toContain('workspace');
    expect(hints.textContent).toContain('Mover la nota aquí');
  });
  it('steps back with Escape before closing', async () => {
    const { store } = await mount('b web');
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe('b ');
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe('');
    expect(store.getState().commandPaletteOpen).toBe(true);
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(store.getState().commandPaletteOpen).toBe(false);
  });
});
