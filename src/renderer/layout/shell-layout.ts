import type { Preferences } from '../../shared/preferences';
import type { MainLayoutState } from './inkdrop-main-layout';

// These are InkNote's adjustable panel constraints, not undocumented Inkdrop widths.
export function resolveShellLayout(
  width: number,
  preferences: Preferences,
  layout: MainLayoutState,
) {
  const editorMinimum = 320;
  const sidebarFits =
    width >=
    preferences.sidebarWidth + preferences.noteListWidth + editorMinimum + 2;
  const listFits = width >= preferences.noteListWidth + editorMinimum + 1;
  const sidebar =
    layout.sidebarVisible && !layout.distractionFreeEnabled && sidebarFits;
  const list = !layout.distractionFreeEnabled && listFits;
  return {
    sidebar,
    list,
    compact: !listFits,
    layout: layout.distractionFreeEnabled
      ? 'main:distraction-free'
      : sidebar
        ? 'main:full'
        : 'main:slim',
  } as const;
}
