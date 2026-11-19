import type { DragEvent } from 'react';
import { noteMarkdownLink } from '../../shared/note-link';

export type LibraryDrag =
  | { kind: 'notes'; ids: readonly string[] }
  | { kind: 'notebook'; id: string };

// Drags stay inside this window, so the payload never has to be parsed back
// from dataTransfer. Files and text dragged from elsewhere are simply ignored.
let activeDrag: LibraryDrag | null = null;

export const noteDragLinks = (
  notes: readonly { id: string; title: string }[],
  ids: readonly string[],
) =>
  notes
    .filter(({ id }) => ids.includes(id))
    .map(noteMarkdownLink)
    .join('\n');

// Text lets the editor insert dragged notes as links. The sidebar still moves them.
export function startLibraryDrag(
  event: DragEvent,
  drag: LibraryDrag,
  text?: string,
) {
  activeDrag = drag;
  event.dataTransfer.effectAllowed = text ? 'copyMove' : 'move';
  if (text) event.dataTransfer.setData('text/plain', text);
  // Chromium cancels a drag that carries no data.
  event.dataTransfer.setData('application/x-inknote-library', drag.kind);
}

export function currentLibraryDrag() {
  return activeDrag;
}

export function endLibraryDrag() {
  activeDrag = null;
}
