import type { AppErrorCode, NoteProjection, Result } from '../../shared/ipc';
import type { MainLayoutState } from '../layout/inkdrop-main-layout';
import type { Preferences, PreferencesPatch } from '../../shared/preferences';
import type { NotebookIconName } from '../../shared/notebook-icons';
import type { InkNoteApi } from '../../preload/api';
import type { InstalledTheme } from '../../shared/themes';
import type { ManagedImage } from '../../shared/images';
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
  readonly installedThemes: readonly InstalledTheme[];
  readonly themesReady: boolean;
  readonly customStyles: string;
  readonly customStylesDraft: string | null;
  readonly themeError: string | null;
  readonly themeRevision: number;
  readonly templatePickerOpen: boolean;
  readonly commandPaletteOpen: boolean;
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
  readonly searchGlobal: boolean;
  readonly notebookDialogParentId: string | null;
  readonly mainLayout: MainLayoutState;
  readonly noteList: NoteListState;
  readonly document: DocumentState;
  readonly parkedDrafts: Readonly<Record<string, DocumentState>>;
}

export interface WorkspaceActions {
  importImage(base64?: string): Promise<Result<ManagedImage | null>>;
  browseThemes: InkNoteApi['themes']['browse'];
  installTheme(name?: string): Promise<void>;
  removeTheme(name: string): Promise<void>;
  saveCustomStyles(css: string): Promise<boolean>;
  editCustomStyles(css: string): void;
  flushThemeChanges(): Promise<boolean>;
  themeDidLoad(): void;
  themeDidFail(): void;
  setTemplatePickerOpen(open: boolean): void;
  setCommandPaletteOpen(open: boolean): void;
  getTemplateNotes(
    query?: string,
    offset?: number,
  ): Promise<Result<NoteProjection[]>>;
  applyTemplate(
    source: Pick<NoteProjection, 'title' | 'body' | 'metadata'>,
  ): Promise<string | null>;
  customizeTemplate(
    source: Pick<NoteProjection, 'title' | 'body' | 'metadata'>,
  ): Promise<void>;
  openExternalLink(url: string): Promise<Result<boolean>>;
  openNoteLink(url: string): Promise<Result<boolean>>;
  searchLinkNotes(query: string): Promise<Result<NoteProjection[]>>;
  createLinkedNote(title: string): Promise<Result<NoteProjection>>;
  updatePreferences(patch: PreferencesPatch): Promise<void>;
  setSettingsOpen(open: boolean): void;
  setNotebookDialogOpen(open: boolean, parentId?: string | null): void;
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
  setSearchGlobal(global: boolean): Promise<void>;
  togglePin(): void;
  setNoteStatus(status: NoteStatus): void;
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
