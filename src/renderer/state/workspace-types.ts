import type { AppErrorCode, NoteProjection, Result } from '../../shared/ipc';
import type { MainLayoutState } from '../layout/inkdrop-main-layout';
import type { Preferences, PreferencesPatch } from '../../shared/preferences';
import type { NotebookIconName } from '../../shared/notebook-icons';
import type {
  LibrarySnapshot,
  NoteMetadata,
  NoteStatus,
} from '../../shared/library';

export type Navigation =
  | { type: 'all' }
  | { type: 'templates' }
  | { type: 'trash' }
  | { type: 'notebook'; id: string }
  | { type: 'status'; status: NoteStatus }
  | { type: 'tag'; name: string };

export interface DocumentState {
  readonly noteId: string | null;
  readonly title: string;
  readonly body: string;
  readonly revision: number | null;
  readonly isDirty: boolean;
  readonly metadata: NoteMetadata;
  readonly isPinned: boolean;
}

export interface NoteListState {
  readonly notes: readonly NoteProjection[];
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly errorCode: AppErrorCode | null;
  readonly isCreating: boolean;
  readonly isSaving: boolean;
  readonly hasMore: boolean;
}

export interface WorkspaceState {
  readonly preferences: Preferences;
  readonly styleNonce: string | null;
  readonly platform: 'darwin' | 'win32' | 'linux';
  readonly preferencesError: boolean;
  readonly settingsOpen: boolean;
  readonly library: LibrarySnapshot;
  readonly navigation: Navigation;
  readonly notebookDialogOpen: boolean;
  readonly activeNoteId: string | null;
  readonly searchQuery: string;
  readonly mainLayout: MainLayoutState;
  readonly noteList: NoteListState;
  readonly document: DocumentState;
  readonly parkedDrafts: Readonly<Record<string, DocumentState>>;
}

export interface WorkspaceActions {
  openExternalLink(url: string): Promise<Result<boolean>>;
  updatePreferences(patch: PreferencesPatch): Promise<void>;
  setSettingsOpen(open: boolean): void;
  setNotebookDialogOpen(open: boolean): void;
  navigate(navigation: Navigation): Promise<void>;
  focusNotebook(id: string | null): Promise<void>;
  toggleNotebook(id: string): Promise<void>;
  refreshLibrary(): Promise<void>;
  createNotebook(name: string, parentId?: string | null): Promise<void>;
  setNotebookIcon(id: string, icon: NotebookIconName): Promise<void>;
  trashActiveNote(): Promise<void>;
  restoreActiveNote(): Promise<void>;
  connect(beforeFlush?: () => void): () => void;
  refreshNotes(preserveLoaded?: boolean): Promise<void>;
  loadMoreNotes(): Promise<void>;
  setSearchQuery(query: string): Promise<void>;
  selectNote(id: string | null): void;
  setSidebarVisible(visible: boolean): void;
  setDistractionFreeEnabled(enabled: boolean): void;
  createNote(): Promise<void>;
  updateDraft(
    changes: Partial<
      Pick<DocumentState, 'title' | 'body' | 'metadata' | 'isPinned'>
    >,
  ): void;
  saveDraft(): Promise<void>;
  flushDrafts(): Promise<boolean>;
  toggleTask(snapshot: string, offset: number, checked: boolean): void;
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions;
