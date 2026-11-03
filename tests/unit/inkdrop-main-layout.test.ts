import { describe, expect, it } from 'vitest';

import {
  inkdropMainLayouts,
  resolveMainLayout,
} from '../../src/renderer/layout/inkdrop-main-layout';

describe('Inkdrop main layout contract', () => {
  it('preserves the documented component distribution', () => {
    expect(inkdropMainLayouts).toEqual({
      'main:full': [
        'ModalLayout',
        'SideBarLayout',
        'NoteListBarLayout',
        'EditorLayout',
      ],
      'main:slim': ['ModalLayout', 'NoteListBarLayout', 'EditorLayout'],
      'main:distraction-free': ['ModalLayout', 'EditorLayout'],
    });
  });

  it.each([
    [{ distractionFreeEnabled: false, sidebarVisible: true }, 'main:full'],
    [{ distractionFreeEnabled: false, sidebarVisible: false }, 'main:slim'],
    [
      { distractionFreeEnabled: true, sidebarVisible: true },
      'main:distraction-free',
    ],
    [
      { distractionFreeEnabled: true, sidebarVisible: false },
      'main:distraction-free',
    ],
  ] as const)('derives %s as %s', (state, expectedLayout) => {
    expect(resolveMainLayout(state)).toBe(expectedLayout);
  });
});
