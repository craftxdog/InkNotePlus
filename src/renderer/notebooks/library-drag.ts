import type { DragEvent } from 'react';

export type LibraryDrag =
  | { kind: 'notes'; ids: readonly string[] }
  | { kind: 'notebook'; id: string };

// Drags stay inside this window, so the payload never has to be parsed back
// from dataTransfer. Files and text dragged from elsewhere are simply ignored.
let activeDrag: LibraryDrag | null = null;

export function startLibraryDrag(event: DragEvent, drag: LibraryDrag) {
  activeDrag = drag;
  event.dataTransfer.effectAllowed = 'move';
  // Chromium cancels a drag that carries no data.
  event.dataTransfer.setData('application/x-inknote-library', drag.kind);
}

export function currentLibraryDrag() {
  return activeDrag;
}

export function endLibraryDrag() {
  activeDrag = null;
}
