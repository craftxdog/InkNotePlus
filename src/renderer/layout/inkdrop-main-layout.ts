export type MainLayoutName =
  | 'main:full'
  | 'main:slim'
  | 'main:distraction-free';

export type MainLayoutComponent =
  | 'ModalLayout'
  | 'SideBarLayout'
  | 'NoteListBarLayout'
  | 'EditorLayout';

export interface MainLayoutState {
  readonly distractionFreeEnabled: boolean;
  readonly sidebarVisible: boolean;
}

export const inkdropMainLayouts: Readonly<
  Record<MainLayoutName, readonly MainLayoutComponent[]>
> = {
  'main:full': [
    'ModalLayout',
    'SideBarLayout',
    'NoteListBarLayout',
    'EditorLayout',
  ],
  'main:slim': ['ModalLayout', 'NoteListBarLayout', 'EditorLayout'],
  'main:distraction-free': ['ModalLayout', 'EditorLayout'],
};

export function resolveMainLayout({
  distractionFreeEnabled,
  sidebarVisible,
}: MainLayoutState): MainLayoutName {
  if (distractionFreeEnabled) {
    return 'main:distraction-free';
  }

  return sidebarVisible ? 'main:full' : 'main:slim';
}
