import { describe, expect, it, vi } from 'vitest';
import type { DragEvent } from 'react';
import {
  noteDragLinks,
  startLibraryDrag,
} from '../../src/renderer/notebooks/library-drag';

const dragEvent = () => {
  const setData = vi.fn();
  return {
    event: {
      dataTransfer: { setData, effectAllowed: 'none' },
    } as unknown as DragEvent,
    setData,
  };
};

describe('note drag links', () => {
  const notes = [
    { id: 'a', title: 'Alfa' },
    { id: 'b', title: 'Beta' },
    { id: 'c', title: 'Gamma' },
  ];

  it('builds one Markdown link per dragged note, in list order', () => {
    expect(noteDragLinks(notes, ['c', 'a'])).toBe(
      '[Alfa](inknote://note/a)\n[Gamma](inknote://note/c)',
    );
  });

  it('offers the links as text so the editor can insert them', () => {
    const { event, setData } = dragEvent();
    startLibraryDrag(event, { kind: 'notes', ids: ['a'] }, 'enlace');
    expect(setData).toHaveBeenCalledWith('text/plain', 'enlace');
    expect(event.dataTransfer.effectAllowed).toBe('copyMove');
  });

  it('keeps notebook drags as a move without text', () => {
    const { event, setData } = dragEvent();
    startLibraryDrag(event, { kind: 'notebook', id: 'n' });
    expect(setData).not.toHaveBeenCalledWith('text/plain', expect.anything());
    expect(event.dataTransfer.effectAllowed).toBe('move');
  });
});
