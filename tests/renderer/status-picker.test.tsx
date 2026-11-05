// @vitest-environment jsdom
import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { StatusPicker } from '../../src/renderer/components/status-picker';
import type { NoteStatus } from '../../src/shared/note-metadata';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';
import { App } from '../../src/renderer/app';
import { createWorkspaceStore } from '../../src/renderer/state/workspace-store';
import { createApi, firstNote } from '../support/renderer-api';
import { success, type UpdateNoteInput } from '../../src/shared/ipc';

const original = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'showPopover',
);
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    value(this: HTMLElement) {
      this.style.display = 'block';
    },
  }),
);
afterAll(() => {
  if (original)
    Object.defineProperty(HTMLElement.prototype, 'showPopover', original);
  else Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
});
afterEach(cleanup);

function mount(disabled = false) {
  const changed = vi.fn();
  function Picker() {
    const [value, setValue] = useState<NoteStatus>('active');
    return (
      <StatusPicker
        value={value}
        disabled={disabled}
        onChange={(status) => {
          changed(status);
          setValue(status);
        }}
      />
    );
  }
  render(<Picker />);
  return changed;
}

it('shows all five statuses with the saved selection and changes only on confirmation', () => {
  const changed = mount();
  const trigger = screen.getByRole('button', {
    name: 'Estado de la nota: Activo',
  });
  fireEvent.click(trigger);
  const rows = screen.getAllByRole('menuitemradio');
  const icon = rows[1].querySelector('svg')!;
  expect(
    icon
      .querySelector('circle')!
      .compareDocumentPosition(icon.querySelector('path')!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expect(rows.map((row) => row.textContent)).toEqual([
    'Sin estado',
    'Activo',
    'En espera',
    'Completado',
    'Descartado',
  ]);
  expect(
    screen
      .getByRole('menuitemradio', { name: 'Activo' })
      .getAttribute('aria-checked'),
  ).toBe('true');
  expect(document.activeElement).toBe(rows[1]);
  fireEvent.keyDown(rows[1], { key: 'ArrowDown' });
  expect(document.activeElement).toBe(rows[2]);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(rows[2]);
  expect(changed).toHaveBeenCalledWith('onhold');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('supports keyboard cancellation, repeated trigger clicks and disabled documents', () => {
  const changed = mount();
  const trigger = screen.getByRole('button', { name: /Estado de la nota/ });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(document.activeElement?.textContent).toBe('Descartado');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.blur(document.activeElement!, { relatedTarget: trigger });
  fireEvent.click(trigger);
  expect(screen.queryByRole('menu')).toBeNull();
  cleanup();
  mount(true);
  fireEvent.click(screen.getByRole('button', { name: /Estado de la nota/ }));
  expect(screen.queryByRole('menu')).toBeNull();
});

it('autosaves status while retaining the notebook and tags', async () => {
  const metadata = {
    ...defaultNoteMetadata,
    tags: ['keep'],
    notebookId: '6a5115f8-747f-416d-82d5-d9c12e34d323',
  };
  const note = { ...firstNote, metadata };
  const update = vi.fn(async (input: UpdateNoteInput) =>
    success({ ...note, ...input, revision: 2 }),
  );
  const store = createWorkspaceStore(
    createApi({ list: async () => success([note]), update }).api,
  );
  render(<App store={store} />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Estado de la nota: Sin estado',
    }),
  );
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Completado' }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { ...metadata, status: 'completed' },
      }),
    ),
  );
  await waitFor(() => expect(store.getState().document.isDirty).toBe(false));
});
