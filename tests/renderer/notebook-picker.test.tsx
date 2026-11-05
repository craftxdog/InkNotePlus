// @vitest-environment jsdom
import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { NotebookPicker } from '../../src/renderer/components/notebook-picker';
import type { Notebook } from '../../src/shared/library';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { emptyLibrary } from '../../src/shared/library';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';
import { success, type UpdateNoteInput } from '../../src/shared/ipc';
import { createApi, firstNote } from '../support/renderer-api';
import { waitFor } from '@testing-library/react';

// jsdom has no top layer. Native dismissal and positioning are checked in Electron.
const originalPopover = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'showPopover',
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    value(this: HTMLElement) {
      this.style.display = 'block';
    },
  });
});
afterAll(() => {
  if (originalPopover)
    Object.defineProperty(
      HTMLElement.prototype,
      'showPopover',
      originalPopover,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
});
afterEach(cleanup);

const books: Notebook[] = [
  {
    id: 'projects',
    name: 'Proyectos',
    parentId: 'work',
    icon: 'rocket',
    count: 3,
    descendantCount: 3,
  },
  {
    id: 'inbox',
    name: 'Inbox',
    parentId: null,
    icon: 'inbox',
    count: 2,
    descendantCount: 2,
  },
  {
    id: 'work',
    name: 'Trabajo',
    parentId: null,
    icon: 'briefcase',
    count: 0,
    descendantCount: 3,
  },
];
function mount(disabled = false) {
  const changed = vi.fn();
  function Picker() {
    const [value, setValue] = useState<string | null>('work');
    return (
      <NotebookPicker
        notebooks={books}
        value={value}
        disabled={disabled}
        onChange={(id) => {
          changed(id);
          setValue(id);
        }}
      />
    );
  }
  render(<Picker />);
  return changed;
}

it('shows a searchable, hierarchical selector with the current notebook', () => {
  const changed = mount();
  const trigger = screen.getByRole('button', {
    name: 'Notebook de la nota: Trabajo',
  });
  fireEvent.click(trigger);
  const search = screen.getByRole('combobox', { name: 'Buscar notebooks' });
  expect(document.activeElement).toBe(search);
  const options = within(screen.getByRole('listbox')).getAllByRole('option');
  expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
    'Sin notebook',
    'Inbox',
    'Trabajo',
    'Trabajo / Proyectos',
  ]);
  expect(
    screen
      .getByRole('option', { name: 'Trabajo' })
      .getAttribute('aria-selected'),
  ).toBe('true');
  fireEvent.change(search, { target: { value: 'proyectos' } });
  expect(screen.queryByRole('option', { name: 'Inbox' })).toBeNull();
  expect(screen.getByRole('option', { name: 'Trabajo' })).toBeTruthy();
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(changed).toHaveBeenCalledWith('projects');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(trigger.textContent).toContain('Proyectos');
});

it('supports arrow keys and cancels without changing the saved notebook', () => {
  const changed = mount();
  const trigger = screen.getByRole('button', { name: /Notebook de la nota/ });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const search = screen.getByRole('combobox', { name: 'Buscar notebooks' });
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  expect(
    document.getElementById(search.getAttribute('aria-activedescendant')!)
      ?.textContent,
  ).toContain('Proyectos');
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(changed).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name: 'Sin notebook' }));
  expect(changed).toHaveBeenCalledWith(null);
});

it('closes when its trigger is clicked again after the search field loses focus', () => {
  const changed = mount();
  const trigger = screen.getByRole('button', { name: /Notebook de la nota/ });
  fireEvent.click(trigger);
  fireEvent.blur(screen.getByRole('combobox', { name: 'Buscar notebooks' }), {
    relatedTarget: trigger,
  });
  fireEvent.click(trigger);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(changed).not.toHaveBeenCalled();
});

it('handles no matches, IME input and disabled notes without an accidental move', () => {
  const changed = mount();
  fireEvent.click(screen.getByRole('button', { name: /Notebook de la nota/ }));
  const search = screen.getByRole('combobox', { name: 'Buscar notebooks' });
  fireEvent.change(search, { target: { value: 'missing' } });
  expect(screen.getByRole('status').textContent).toContain(
    'No se encontraron notebooks',
  );
  fireEvent.keyDown(search, { key: 'Enter' });
  fireEvent.change(search, { target: { value: 'proyectos' } });
  fireEvent.keyDown(search, { key: 'Enter', isComposing: true });
  expect(changed).not.toHaveBeenCalled();
  cleanup();
  mount(true);
  fireEvent.click(screen.getByRole('button', { name: /Notebook de la nota/ }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('autosaves a chosen notebook without replacing the note status or tags', async () => {
  const note = {
    ...firstNote,
    metadata: {
      ...defaultNoteMetadata,
      status: 'active' as const,
      tags: ['keep'],
    },
  };
  const update = vi.fn(async (input: UpdateNoteInput) =>
    success({ ...note, ...input, revision: 2 }),
  );
  const bridge = createApi({ list: async () => success([note]), update });
  bridge.api.library.get = async () =>
    success({ ...emptyLibrary, notebooks: books });
  const store = createWorkspaceStore(bridge.api);
  const { unmount } = render(<App store={store} />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Notebook de la nota: Sin notebook',
    }),
  );
  fireEvent.click(screen.getByRole('option', { name: 'Trabajo / Proyectos' }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { ...note.metadata, notebookId: 'projects' },
      }),
    ),
  );
  await waitFor(() => expect(store.getState().document.isDirty).toBe(false));
  unmount();
});
