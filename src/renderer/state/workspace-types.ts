import type {
  AppErrorCode,
  ManageTrashInput,
  NoteProjection,
  NoteRevision,
  NoteRevisionSummary,
  NoteSort,
  Result,
} from '../../shared/ipc';
import type { MainLayoutState } from '../layout/inkdrop-main-layout';
import type { Preferences, PreferencesPatch } from '../../shared/preferences';
import type { NotebookIconName } from '../../shared/notebook-icons';
import type { InkNoteApi } from '../../preload/api';
import type { InstalledTheme } from '../../shared/themes';
import type { ManagedImage } from '../../shared/images';
import type { UpdateTagInput } from '../../shared/tags';
import type {
  ExportNotesInput,
  ExportSummary,
  ImportNotesInput,
  ImportSummary,
} from '../../shared/transfer';
import type {
  LibrarySnapshot,
  MoveNotebookInput,
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

export type NoteActionKind =
  | 'trash'
  | 'restore'
  | 'delete'
  | 'move-notes'
  | 'tag-notes'
  | 'status-notes';

export type LibraryDialogRequest =
  | { kind: NoteActionKind; ids: readonly string[] }
  | { kind: 'empty' }
  | {
      kind: 'delete-notebook' | 'rename-notebook' | 'move-notebook';
      id: string;
      name: string;
    }
  | { kind: 'edit-tag' | 'delete-tag'; name: string }
  | { kind: 'import-result'; summary: ImportSummary | null }
  | { kind: 'export-result'; summary: ExportSummary | null };

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
  readonly commandPaletteQuery: string;
  readonly outlineOpen: boolean;
  readonly previewFindOpen: boolean;
  readonly revisionsOpen: boolean;
  readonly imageViewer: { readonly src: string; readonly alt: string } | null;
  readonly preferences: Preferences;
  readonly styleNonce: string | null;
  readonly platform: 'darwin' | 'win32' | 'linux';
  readonly preferencesError: boolean;
  readonly settingsOpen: boolean;
  readonly library: LibrarySnapshot;
  readonly navigation: Navigation;
  readonly notebookDialogOpen: boolean;
  readonly activeNoteId: string | null;
  readonly selectedNoteIds: readonly string[];
  readonly tagFilter: readonly string[];
  readonly libraryDialog: LibraryDialogRequest | null;
  readonly searchQuery: string;
  readonly searchGlobal: boolean;
  readonly notebookDialogParentId: string | null;
  readonly mainLayout: MainLayoutState;
  readonly sidebarDrawerOpen: boolean;
  readonly noteHistory: {
    readonly ids: readonly string[];
    readonly index: number;
  };
  readonly noteList: NoteListState;
  readonly document: DocumentState;
  readonly parkedDrafts: Readonly<Record<string, DocumentState>>;
}

export interface WorkspaceActions {
  navigateHistory(direction: -1 | 1): Promise<boolean>;
  setWindowBackground: InkNoteApi['setWindowBackground'];
  reloadWindow: InkNoteApi['reloadWindow'];
  readonly transfer: InkNoteApi['transfer'];
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
  setCommandPaletteOpen(open: boolean, query?: string): void;
  setOutlineOpen(open: boolean): void;
  setPreviewFindOpen(open: boolean): void;
  setRevisionsOpen(open: boolean): void;
  listNoteRevisions(id: string): Promise<Result<NoteRevisionSummary[]>>;
  getNoteRevision(id: string, revision: number): Promise<Result<NoteRevision>>;
  restoreNoteVersion(version: {
    title: string;
    body: string;
  }): Promise<Result<NoteProjection>>;
  exportNotes(input: ExportNotesInput): Promise<void>;
  importNotes(
    kind: ImportNotesInput['kind'],
    notebookId?: string | null,
  ): Promise<void>;
  setImageViewer(image: { src: string; alt: string } | null): void;
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
  fetchLinkTitle(url: string): Promise<string | null>;
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
  manageTrash(input: ManageTrashInput): Promise<Result<number>>;
  renameNotebook(id: string, name: string): Promise<Result<boolean>>;
  moveNotebook(input: MoveNotebookInput): Promise<Result<boolean>>;
  reorderNotebook(input: MoveNotebookInput): Promise<void>;
  moveNotes(ids: readonly string[], notebookId: string | null): Promise<void>;
  deleteNotebook(id: string): Promise<Result<string[]>>;
  updateTag(input: UpdateTagInput): Promise<Result<boolean>>;
  deleteTag(name: string): Promise<Result<boolean>>;
  setLibraryDialog(request: LibraryDialogRequest | null): void;
  openNoteAction(kind: NoteActionKind, ids?: readonly string[]): boolean;
  updateNotes(input: ManageTrashInput): Promise<Result<number>>;
  setNoteSort(sort: NoteSort): Promise<void>;
  setTagFilter(names: readonly string[]): Promise<void>;
  toggleTagFilter(name: string): Promise<void>;
  renameTagFilter(name: string, next: string | null): void;
  connect(beforeFlush?: () => void): () => void;
  refreshNotes(preserveLoaded?: boolean): Promise<void>;
  loadMoreNotes(): Promise<void>;
  setSearchQuery(query: string): Promise<void>;
  setSearchGlobal(global: boolean): Promise<void>;
  togglePin(): void;
  setNoteStatus(status: NoteStatus): void;
  selectNote(id: string | null): void;
  toggleNoteSelection(id: string): void;
  setSidebarVisible(visible: boolean): void;
  toggleSidebar(width: number): void;
  setSidebarDrawerOpen(open: boolean): void;
  setDistractionFreeEnabled(enabled: boolean): void;
  createNote(): Promise<void>;
  duplicateNotes(ids?: readonly string[]): Promise<boolean>;
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
