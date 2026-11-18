// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NoteOutlinePanel } from '../../src/renderer/components/note-outline-panel';

afterEach(cleanup);
const body = '# Uno\n\ntexto\n\n## Dos\n\n- [x] Tarea\n';

it('lists the outline and marks the section under the cursor', () => {
  const { rerender } = render(
    <NoteOutlinePanel
      body={body}
      currentLine={3}
      onJump={() => {}}
      onClose={() => {}}
    />,
  );
  const current = () => screen.getByRole('button', { current: 'location' });
  expect(current().textContent).toBe('Uno');
  rerender(
    <NoteOutlinePanel
      body={body}
      currentLine={7}
      onJump={() => {}}
      onClose={() => {}}
    />,
  );
  expect(current().textContent).toBe('Tarea');
});

it('jumps to the chosen item', () => {
  const onJump = vi.fn();
  render(
    <NoteOutlinePanel
      body={body}
      currentLine={1}
      onJump={onJump}
      onClose={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Dos' }));
  expect(onJump).toHaveBeenCalledWith(5);
});

it('closes with its button and Escape', () => {
  const onClose = vi.fn();
  render(
    <NoteOutlinePanel
      body={body}
      currentLine={1}
      onJump={() => {}}
      onClose={onClose}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar esquema' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Uno' }), {
    key: 'Escape',
  });
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('explains an empty outline', () => {
  render(
    <NoteOutlinePanel
      body="sólo texto"
      currentLine={1}
      onJump={() => {}}
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole('status').textContent).toContain('encabezados');
});
