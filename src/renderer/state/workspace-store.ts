import { create } from 'zustand';

export interface WorkspaceState {
  activeNoteId: string | null;
  searchQuery: string;
  selectNote: (noteId: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export const initialWorkspaceState = {
  activeNoteId: null,
  searchQuery: '',
} satisfies Pick<WorkspaceState, 'activeNoteId' | 'searchQuery'>;

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...initialWorkspaceState,
  selectNote: (activeNoteId) => set({ activeNoteId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
