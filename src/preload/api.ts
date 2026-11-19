import {
  PLUGIN_CHANNELS,
  pluginDoneResultSchema,
  pluginInstallResultSchema,
  pluginListResultSchema,
  pluginLoadResultSchema,
  pluginNameSchema,
  type PluginBundle,
  type PluginInfo,
  type PluginInstallResponse,
} from '../shared/plugins';
import {
  SYNC_CHANNELS,
  syncConnectResultSchema,
  syncConnectSchema,
  syncDiagnoseResultSchema,
  syncDiagnoseSchema,
  syncStatusResultSchema,
  syncStatusSchema,
  type SyncConnectInput,
  type SyncDiagnostic,
  type SyncErrorStatus,
  type SyncStatus,
} from '../shared/sync';
import {
  AI_CHANNELS,
  aiCancelResultSchema,
  aiCancelSchema,
  aiKeySchema,
  aiRequestSchema,
  aiRunResultSchema,
  aiStatusResultSchema,
  type AiRequest,
  type AiResponse,
  type AiStatus,
} from '../shared/ai';
import {
  GITHUB_CHANNELS,
  githubSnippetResultSchema,
  githubStatusResultSchema,
  githubTokenSchema,
  githubUrlSchema,
  type GithubSnippetResponse,
} from '../shared/github-snippet';
import {
  LOCAL_API_CHANNELS,
  localApiResultSchema,
  localApiStatusSchema,
  type LocalApiStatus,
} from '../shared/local-api';
import {
  activityInputSchema,
  activityResultSchema,
  type ActivityDay,
  type ActivityInput,
} from '../shared/activity';
import { z } from '../shared/validation';
import { appErrorSchema } from '../shared/ipc';
import {
  KEYMAP_CHANNELS,
  keymapFileSchema,
  type KeymapFile,
} from '../shared/keymap-file';
import type { IpcRenderer } from 'electron';
import type { ZodType } from 'zod';
import {
  IMAGE_CHANNELS,
  imageResultSchema,
  imageWriteSchema,
  type ManagedImage,
} from '../shared/images';
import {
  THEME_CHANNELS,
  themeListResultSchema,
  registryResultSchema,
  themeInstallResultSchema,
  stylesResultSchema,
  themeNameInputSchema,
  registryInputSchema,
  customStylesSchema,
  type InstalledTheme,
  type ThemeRegistryInput,
  type RegistryTheme,
  type ThemeResult,
} from '../shared/themes';
import {
  WINDOW_CHANNELS,
  closeRequestSchema,
  closeReadinessSchema,
  closeConfirmationSchema,
  closeResultSchema,
  windowBackgroundSchema,
  MENU_COMMAND_CHANNEL,
  NOTE_WINDOW_CHANNEL,
  noteWindowResultSchema,
} from '../shared/window-lifecycle';
import { linkedNoteId } from '../shared/note-link';
import {
  EXTERNAL_LINK_CHANNEL,
  LINK_TITLE_CHANNEL,
  NOTE_LINK_CHANNEL,
  NOTE_LINK_READY_CHANNEL,
  externalLinkSchema,
  externalLinkResultSchema,
  linkTitleResultSchema,
} from '../shared/external-link';
import {
  exportNotesSchema,
  importNotesSchema,
  importResultSchema,
  type ExportNotesInput,
  type ImportNotesInput,
  type ImportSummary,
  TRANSFER_CHANNELS,
  backupDirectoryResultSchema,
  backupStatusResultSchema,
  backupStatusSchema,
  exportNoteSchema,
  exportResultSchema,
  restoreResultSchema,
  type BackupStatus,
  type ExportNoteInput,
  type ExportSummary,
  type RestoreSummary,
} from '../shared/transfer';
import {
  LIBRARY_CHANNELS,
  createNotebookSchema,
  libraryResultSchema,
  notebookResultSchema,
  libraryInputSchema,
  deleteNotebookSchema,
  deletedNotebooksResultSchema,
  tagMutationResultSchema,
  moveNotebookSchema,
  notebookMutationResultSchema,
  renameNotebookSchema,
  type LibraryInput,
  type CreateNotebookInput,
  type MoveNotebookInput,
  type RenameNotebookInput,
  type LibrarySnapshot,
  type Notebook,
} from '../shared/library';
import {
  deleteTagSchema,
  updateTagSchema,
  type UpdateTagInput,
} from '../shared/tags';
import {
  bootstrapResultSchema,
  preferencesResultSchema,
  emptyPreferencesInputSchema,
  preferencesPatchSchema,
  PREFERENCES_CHANNELS,
  type AppBootstrap,
  type Preferences,
  type PreferencesPatch,
} from '../shared/preferences';

import {
  IPC_CHANNELS,
  createNoteInputSchema,
  affectedCountResultSchema,
  failure,
  listNotesInputSchema,
  manageTrashSchema,
  noteChangedEventSchema,
  noteIdInputSchema,
  noteRevisionInputSchema,
  noteRevisionListResultSchema,
  noteRevisionResultSchema,
  type NoteRevision,
  type NoteRevisionInput,
  type NoteRevisionSummary,
  noteListResultSchema,
  noteResultSchema,
  searchNotesInputSchema,
  type CreateNoteInput,
  type ListNotesInput,
  type ManageTrashInput,
  type NoteChangedEvent,
  type NoteIdInput,
  type NoteProjection,
  type Result,
  type SearchNotesInput,
  type UpdateNoteInput,
  updateNoteInputSchema,
} from '../shared/ipc';

type InputSchema<T> = Pick<ZodType<T>, 'safeParse'>;
import {
  setNotebookIconSchema,
  type SetNotebookIconInput,
} from '../shared/notebook-icons';

export interface InkNoteApi {
  transfer: {
    backupStatus(): Promise<Result<BackupStatus>>;
    chooseBackupDirectory(): Promise<Result<string | null>>;
    enableBackup(): Promise<Result<BackupStatus>>;
    disableBackup(): Promise<Result<BackupStatus>>;
    runBackup(): Promise<Result<BackupStatus>>;
    restoreBackup(): Promise<Result<RestoreSummary | null>>;
    exportNote(input: ExportNoteInput): Promise<Result<ExportSummary | null>>;
    exportLibrary(): Promise<Result<ExportSummary | null>>;
    importNotes(input: ImportNotesInput): Promise<Result<ImportSummary | null>>;
    exportNotes(input: ExportNotesInput): Promise<Result<ExportSummary | null>>;
    onBackupChanged(listener: (status: BackupStatus) => void): () => void;
  };
  images: {
    importFile(): Promise<Result<ManagedImage | null>>;
    write(base64: string): Promise<Result<ManagedImage | null>>;
  };
  themes: {
    list(): Promise<ThemeResult<InstalledTheme[]>>;
    browse(input?: ThemeRegistryInput): Promise<ThemeResult<RegistryTheme[]>>;
    install(name: string): Promise<ThemeResult<InstalledTheme>>;
    importFolder(): Promise<ThemeResult<InstalledTheme>>;
    remove(name: string): Promise<ThemeResult<InstalledTheme[]>>;
    getCustomStyles(): Promise<ThemeResult<string>>;
    setCustomStyles(css: string): Promise<ThemeResult<string>>;
    onCustomStylesChanged(listener: (css: string) => void): () => void;
  };
  onBeforeClose(listener: () => Promise<boolean>): () => void;
  onMenuCommand(listener: (command: string) => void): () => void;
  openNoteWindow(noteId: string | null): Promise<Result<boolean>>;
  plugins: {
    list(): Promise<Result<PluginInfo[]>>;
    install(): Promise<Result<PluginInstallResponse | null>>;
    remove(name: string): Promise<Result<boolean>>;
    load(name: string): Promise<Result<PluginBundle | null>>;
    openInit(): Promise<Result<boolean>>;
  };
  sync: {
    status(): Promise<Result<SyncStatus>>;
    connect(
      input: SyncConnectInput,
    ): Promise<Result<{ error: SyncErrorStatus | null }>>;
    disconnect(): Promise<Result<SyncStatus>>;
    run(): Promise<Result<SyncStatus>>;
    diagnose(
      input: z.output<typeof syncDiagnoseSchema>,
    ): Promise<Result<SyncDiagnostic[]>>;
    onChange(listener: (status: SyncStatus) => void): () => void;
  };
  ai: {
    status(): Promise<Result<AiStatus>>;
    setKey(key: string): Promise<Result<AiStatus>>;
    clearKey(): Promise<Result<AiStatus>>;
    run(request: AiRequest): Promise<Result<AiResponse>>;
    cancel(requestId: string): Promise<Result<boolean>>;
  };
  github: {
    snippet(url: string): Promise<Result<GithubSnippetResponse>>;
    status(): Promise<Result<boolean>>;
    setToken(token: string): Promise<Result<boolean>>;
    clearToken(): Promise<Result<boolean>>;
  };
  localApi: {
    status(): Promise<Result<LocalApiStatus>>;
    regenerate(): Promise<Result<LocalApiStatus>>;
    onChange(listener: (status: LocalApiStatus) => void): () => void;
  };
  keymap: {
    get(): Promise<Result<KeymapFile>>;
    open(): Promise<Result<boolean>>;
    onChange(listener: (file: KeymapFile) => void): () => void;
  };
  setWindowBackground(color: string): Promise<Result<boolean>>;
  reloadWindow(): Promise<Result<boolean>>;
  links: {
    openExternal(url: string): Promise<Result<boolean>>;
    fetchTitle(url: string): Promise<Result<string | null>>;
    onOpenNote(listener: (url: string) => void): () => void;
  };
  library: {
    get(input?: LibraryInput): Promise<Result<LibrarySnapshot>>;
    getActivity(input: ActivityInput): Promise<Result<ActivityDay[]>>;
    createNotebook(input: CreateNotebookInput): Promise<Result<Notebook>>;
    setNotebookIcon(input: SetNotebookIconInput): Promise<Result<Notebook>>;
    renameNotebook(input: RenameNotebookInput): Promise<Result<boolean>>;
    moveNotebook(input: MoveNotebookInput): Promise<Result<boolean>>;
    deleteNotebook(id: string): Promise<Result<string[]>>;
    updateTag(input: UpdateTagInput): Promise<Result<boolean>>;
    deleteTag(name: string): Promise<Result<boolean>>;
  };
  preferences: {
    get(): Promise<Result<AppBootstrap>>;
    update(input: PreferencesPatch): Promise<Result<Preferences>>;
  };
  notes: {
    create(input: CreateNoteInput): Promise<Result<NoteProjection>>;
    update(input: UpdateNoteInput): Promise<Result<NoteProjection>>;
    list(input?: ListNotesInput): Promise<Result<NoteProjection[]>>;
    search(input: SearchNotesInput): Promise<Result<NoteProjection[]>>;
    moveToTrash(input: NoteIdInput): Promise<Result<NoteProjection>>;
    restore(input: NoteIdInput): Promise<Result<NoteProjection>>;
    manageTrash(input: ManageTrashInput): Promise<Result<number>>;
    listRevisions(input: NoteIdInput): Promise<Result<NoteRevisionSummary[]>>;
    getRevision(input: NoteRevisionInput): Promise<Result<NoteRevision>>;
  };
  onNoteChanged(listener: (event: NoteChangedEvent) => void): () => void;
}

export function createInkNoteApi(
  ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>,
): InkNoteApi {
  return {
    reloadWindow: () =>
      invoke(
        ipcRenderer,
        WINDOW_CHANNELS.reload,
        {},
        emptyPreferencesInputSchema,
        closeResultSchema,
      ),
    setWindowBackground: (color) =>
      invoke(
        ipcRenderer,
        WINDOW_CHANNELS.background,
        color,
        windowBackgroundSchema,
        closeResultSchema,
      ),
    transfer: {
      backupStatus: () =>
        transferCall(TRANSFER_CHANNELS.backupStatus, backupStatusResultSchema),
      chooseBackupDirectory: () =>
        transferCall(
          TRANSFER_CHANNELS.chooseBackupDirectory,
          backupDirectoryResultSchema,
        ),
      enableBackup: () =>
        transferCall(TRANSFER_CHANNELS.enableBackup, backupStatusResultSchema),
      disableBackup: () =>
        transferCall(TRANSFER_CHANNELS.disableBackup, backupStatusResultSchema),
      runBackup: () =>
        transferCall(TRANSFER_CHANNELS.runBackup, backupStatusResultSchema),
      restoreBackup: () =>
        transferCall(TRANSFER_CHANNELS.restoreBackup, restoreResultSchema),
      exportNote: (input) =>
        invoke(
          ipcRenderer,
          TRANSFER_CHANNELS.exportNote,
          input,
          exportNoteSchema,
          exportResultSchema,
        ),
      exportLibrary: () =>
        transferCall(TRANSFER_CHANNELS.exportLibrary, exportResultSchema),
      exportNotes: (input) =>
        invoke(
          ipcRenderer,
          TRANSFER_CHANNELS.exportNotes,
          input,
          exportNotesSchema,
          exportResultSchema,
        ),
      importNotes: (input) =>
        invoke(
          ipcRenderer,
          TRANSFER_CHANNELS.importNotes,
          input,
          importNotesSchema,
          importResultSchema,
        ),
      onBackupChanged(listener) {
        const handler = (_event: unknown, value: unknown) => {
          const parsed = backupStatusSchema.safeParse(value);
          if (parsed.success) listener(parsed.data);
        };
        ipcRenderer.on(TRANSFER_CHANNELS.backupChanged, handler);
        return () =>
          ipcRenderer.removeListener(TRANSFER_CHANNELS.backupChanged, handler);
      },
    },
    images: {
      importFile: () =>
        invoke(
          ipcRenderer,
          IMAGE_CHANNELS.import,
          {},
          emptyPreferencesInputSchema,
          imageResultSchema,
        ),
      write: (base64) =>
        invoke(
          ipcRenderer,
          IMAGE_CHANNELS.write,
          { base64 },
          imageWriteSchema,
          imageResultSchema,
        ),
    },
    themes: {
      list: () =>
        themeInvoke(
          THEME_CHANNELS.list,
          {},
          emptyPreferencesInputSchema,
          themeListResultSchema,
        ),
      browse: (input = {}) =>
        themeInvoke(
          THEME_CHANNELS.browse,
          input,
          registryInputSchema,
          registryResultSchema,
        ),
      install: (name) =>
        themeInvoke(
          THEME_CHANNELS.install,
          { name },
          themeNameInputSchema,
          themeInstallResultSchema,
        ),
      importFolder: () =>
        themeInvoke(
          THEME_CHANNELS.import,
          {},
          emptyPreferencesInputSchema,
          themeInstallResultSchema,
        ),
      remove: (name) =>
        themeInvoke(
          THEME_CHANNELS.remove,
          { name },
          themeNameInputSchema,
          themeListResultSchema,
        ),
      getCustomStyles: () =>
        themeInvoke(
          THEME_CHANNELS.stylesGet,
          {},
          emptyPreferencesInputSchema,
          stylesResultSchema,
        ),
      setCustomStyles: (css) =>
        themeInvoke(
          THEME_CHANNELS.stylesSet,
          css,
          customStylesSchema,
          stylesResultSchema,
        ),
      onCustomStylesChanged(listener) {
        const handler = (_event: unknown, value: unknown) => {
          const parsed = customStylesSchema.safeParse(value);
          if (parsed.success) listener(parsed.data);
        };
        ipcRenderer.on(THEME_CHANNELS.stylesChanged, handler);
        return () =>
          ipcRenderer.removeListener(THEME_CHANNELS.stylesChanged, handler);
      },
    },
    plugins: {
      list: () =>
        invoke(
          ipcRenderer,
          PLUGIN_CHANNELS.list,
          undefined,
          z.undefined(),
          pluginListResultSchema,
        ),
      install: () =>
        invoke(
          ipcRenderer,
          PLUGIN_CHANNELS.install,
          undefined,
          z.undefined(),
          pluginInstallResultSchema,
        ),
      remove: (name) =>
        invoke(
          ipcRenderer,
          PLUGIN_CHANNELS.remove,
          name,
          pluginNameSchema,
          pluginDoneResultSchema,
        ),
      load: (name) =>
        invoke(
          ipcRenderer,
          PLUGIN_CHANNELS.load,
          name,
          pluginNameSchema,
          pluginLoadResultSchema,
        ),
      openInit: () =>
        invoke(
          ipcRenderer,
          PLUGIN_CHANNELS.openInit,
          undefined,
          z.undefined(),
          pluginDoneResultSchema,
        ),
    },
    sync: {
      status: () =>
        invoke(
          ipcRenderer,
          SYNC_CHANNELS.status,
          undefined,
          z.undefined(),
          syncStatusResultSchema,
        ),
      connect: (input) =>
        invoke(
          ipcRenderer,
          SYNC_CHANNELS.connect,
          input,
          syncConnectSchema,
          syncConnectResultSchema,
        ),
      disconnect: () =>
        invoke(
          ipcRenderer,
          SYNC_CHANNELS.disconnect,
          undefined,
          z.undefined(),
          syncStatusResultSchema,
        ),
      run: () =>
        invoke(
          ipcRenderer,
          SYNC_CHANNELS.run,
          undefined,
          z.undefined(),
          syncStatusResultSchema,
        ),
      diagnose: (input) =>
        invoke(
          ipcRenderer,
          SYNC_CHANNELS.diagnose,
          input,
          syncDiagnoseSchema,
          syncDiagnoseResultSchema,
        ),
      onChange(listener) {
        const handler = (_event: unknown, value: unknown) => {
          const status = syncStatusSchema.safeParse(value);
          if (status.success) listener(status.data);
        };
        ipcRenderer.on(SYNC_CHANNELS.changed, handler);
        return () => ipcRenderer.removeListener(SYNC_CHANNELS.changed, handler);
      },
    },
    ai: {
      status: () =>
        invoke(
          ipcRenderer,
          AI_CHANNELS.status,
          undefined,
          z.undefined(),
          aiStatusResultSchema,
        ),
      setKey: (key) =>
        invoke(
          ipcRenderer,
          AI_CHANNELS.setKey,
          key,
          aiKeySchema,
          aiStatusResultSchema,
        ),
      clearKey: () =>
        invoke(
          ipcRenderer,
          AI_CHANNELS.clearKey,
          undefined,
          z.undefined(),
          aiStatusResultSchema,
        ),
      run: (request) =>
        invoke(
          ipcRenderer,
          AI_CHANNELS.run,
          request,
          aiRequestSchema,
          aiRunResultSchema,
        ),
      cancel: (requestId) =>
        invoke(
          ipcRenderer,
          AI_CHANNELS.cancel,
          requestId,
          aiCancelSchema,
          aiCancelResultSchema,
        ),
    },
    github: {
      snippet: (url) =>
        invoke(
          ipcRenderer,
          GITHUB_CHANNELS.snippet,
          url,
          githubUrlSchema,
          githubSnippetResultSchema,
        ),
      status: () =>
        invoke(
          ipcRenderer,
          GITHUB_CHANNELS.status,
          undefined,
          z.undefined(),
          githubStatusResultSchema,
        ),
      setToken: (token) =>
        invoke(
          ipcRenderer,
          GITHUB_CHANNELS.setToken,
          token,
          githubTokenSchema,
          githubStatusResultSchema,
        ),
      clearToken: () =>
        invoke(
          ipcRenderer,
          GITHUB_CHANNELS.clearToken,
          undefined,
          z.undefined(),
          githubStatusResultSchema,
        ),
    },
    localApi: {
      status: () =>
        invoke(
          ipcRenderer,
          LOCAL_API_CHANNELS.status,
          undefined,
          z.undefined(),
          localApiResultSchema,
        ),
      regenerate: () =>
        invoke(
          ipcRenderer,
          LOCAL_API_CHANNELS.regenerate,
          undefined,
          z.undefined(),
          localApiResultSchema,
        ),
      onChange(listener) {
        const handler = (_event: unknown, value: unknown) => {
          const status = localApiStatusSchema.safeParse(value);
          if (status.success) listener(status.data);
        };
        ipcRenderer.on(LOCAL_API_CHANNELS.changed, handler);
        return () =>
          ipcRenderer.removeListener(LOCAL_API_CHANNELS.changed, handler);
      },
    },
    keymap: {
      get: () =>
        invoke(
          ipcRenderer,
          KEYMAP_CHANNELS.get,
          undefined,
          z.undefined(),
          keymapResultSchema,
        ),
      open: () =>
        invoke(
          ipcRenderer,
          KEYMAP_CHANNELS.open,
          undefined,
          z.undefined(),
          keymapOpenResultSchema,
        ),
      onChange(listener) {
        const handler = (_event: unknown, value: unknown) => {
          const file = keymapFileSchema.safeParse(value);
          if (file.success) listener(file.data);
        };
        ipcRenderer.on(KEYMAP_CHANNELS.changed, handler);
        return () =>
          ipcRenderer.removeListener(KEYMAP_CHANNELS.changed, handler);
      },
    },
    openNoteWindow: (noteId) =>
      invoke(
        ipcRenderer,
        NOTE_WINDOW_CHANNEL,
        noteId,
        z.uuid().nullable(),
        noteWindowResultSchema,
      ),
    onMenuCommand(listener) {
      const handler = (_event: unknown, value: unknown) => {
        if (typeof value === 'string') listener(value);
      };
      ipcRenderer.on(MENU_COMMAND_CHANNEL, handler);
      return () => ipcRenderer.removeListener(MENU_COMMAND_CHANNEL, handler);
    },
    onBeforeClose(listener) {
      const handler = (_event: unknown, input: unknown) => {
        const parsed = closeRequestSchema.safeParse(input);
        if (!parsed.success) return;
        void Promise.resolve()
          .then(listener)
          .catch(() => false)
          .then((saved) =>
            invoke(
              ipcRenderer,
              WINDOW_CHANNELS.confirm,
              { ...parsed.data, saved },
              closeConfirmationSchema,
              closeResultSchema,
            ),
          );
      };
      ipcRenderer.on(WINDOW_CHANNELS.prepare, handler);
      void invoke(
        ipcRenderer,
        WINDOW_CHANNELS.readiness,
        { ready: true },
        closeReadinessSchema,
        closeResultSchema,
      );
      return () => {
        ipcRenderer.removeListener(WINDOW_CHANNELS.prepare, handler);
        void invoke(
          ipcRenderer,
          WINDOW_CHANNELS.readiness,
          { ready: false },
          closeReadinessSchema,
          closeResultSchema,
        );
      };
    },
    links: {
      openExternal: (url) =>
        invoke(
          ipcRenderer,
          EXTERNAL_LINK_CHANNEL,
          { url },
          externalLinkSchema,
          externalLinkResultSchema,
        ),
      fetchTitle: (url) =>
        invoke(
          ipcRenderer,
          LINK_TITLE_CHANNEL,
          { url },
          externalLinkSchema,
          linkTitleResultSchema,
        ),
      onOpenNote(listener) {
        const handler = (_event: unknown, value: unknown) => {
          if (typeof value === 'string' && linkedNoteId(value)) listener(value);
        };
        ipcRenderer.on(NOTE_LINK_CHANNEL, handler);
        void ipcRenderer.invoke(NOTE_LINK_READY_CHANNEL).catch(() => {});
        return () => ipcRenderer.removeListener(NOTE_LINK_CHANNEL, handler);
      },
    },
    library: {
      get: (input = {}) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.get,
          input,
          libraryInputSchema,
          libraryResultSchema,
        ),
      getActivity: (input) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.activity,
          input,
          activityInputSchema,
          activityResultSchema,
        ),
      createNotebook: (input) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.createNotebook,
          input,
          createNotebookSchema,
          notebookResultSchema,
        ),
      setNotebookIcon: (input) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.setNotebookIcon,
          input,
          setNotebookIconSchema,
          notebookResultSchema,
        ),
      renameNotebook: (input) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.renameNotebook,
          input,
          renameNotebookSchema,
          notebookMutationResultSchema,
        ),
      moveNotebook: (input) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.moveNotebook,
          input,
          moveNotebookSchema,
          notebookMutationResultSchema,
        ),
      deleteNotebook: (id) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.deleteNotebook,
          { id },
          deleteNotebookSchema,
          deletedNotebooksResultSchema,
        ),
      updateTag: (input) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.updateTag,
          input,
          updateTagSchema,
          tagMutationResultSchema,
        ),
      deleteTag: (name) =>
        invoke(
          ipcRenderer,
          LIBRARY_CHANNELS.deleteTag,
          { name },
          deleteTagSchema,
          tagMutationResultSchema,
        ),
    },
    preferences: {
      get: () =>
        invoke(
          ipcRenderer,
          PREFERENCES_CHANNELS.get,
          {},
          emptyPreferencesInputSchema,
          bootstrapResultSchema,
        ),
      update: (input) =>
        invoke(
          ipcRenderer,
          PREFERENCES_CHANNELS.update,
          input,
          preferencesPatchSchema,
          preferencesResultSchema,
        ),
    },
    notes: {
      create: (input) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.create,
          input,
          createNoteInputSchema,
          noteResultSchema,
        ),
      update: (input) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.update,
          input,
          updateNoteInputSchema,
          noteResultSchema,
        ),
      listRevisions: (input) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.listRevisions,
          input,
          noteIdInputSchema,
          noteRevisionListResultSchema,
        ),
      getRevision: (input) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.getRevision,
          input,
          noteRevisionInputSchema,
          noteRevisionResultSchema,
        ),
      list: (input = {}) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.list,
          input,
          listNotesInputSchema,
          noteListResultSchema,
        ),
      search: (input) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.search,
          input,
          searchNotesInputSchema,
          noteListResultSchema,
        ),
      moveToTrash: (input) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.moveToTrash,
          input,
          noteIdInputSchema,
          noteResultSchema,
        ),
      restore: (input) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.restore,
          input,
          noteIdInputSchema,
          noteResultSchema,
        ),
      manageTrash: (input) =>
        invoke(
          ipcRenderer,
          IPC_CHANNELS.notes.manageTrash,
          input,
          manageTrashSchema,
          affectedCountResultSchema,
        ),
    },
    onNoteChanged(listener) {
      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsedEvent = noteChangedEventSchema.safeParse(payload);
        if (parsedEvent.success) {
          listener(parsedEvent.data);
        }
      };

      ipcRenderer.on(IPC_CHANNELS.events.noteChanged, wrappedListener);
      return () => {
        ipcRenderer.removeListener(
          IPC_CHANNELS.events.noteChanged,
          wrappedListener,
        );
      };
    },
  };
  function transferCall<T>(channel: string, result: InputSchema<Result<T>>) {
    return invoke(
      ipcRenderer,
      channel,
      {},
      emptyPreferencesInputSchema,
      result,
    );
  }

  async function themeInvoke<I, O>(
    channel: string,
    input: I,
    inputSchema: InputSchema<I>,
    outputSchema: InputSchema<ThemeResult<O>>,
  ): Promise<ThemeResult<O>> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, error: { code: 'invalid_package' } };
    try {
      const result = outputSchema.safeParse(
        await ipcRenderer.invoke(channel, parsed.data),
      );
      return result.success
        ? result.data
        : { ok: false, error: { code: 'unavailable' } };
    } catch {
      return { ok: false, error: { code: 'unavailable' } };
    }
  }
}

const keymapError = z
  .object({ ok: z.literal(false), error: appErrorSchema })
  .strict();
const keymapResultSchema = z.union([
  z.object({ ok: z.literal(true), data: keymapFileSchema }).strict(),
  keymapError,
]);
const keymapOpenResultSchema = z.union([
  z.object({ ok: z.literal(true), data: z.boolean() }).strict(),
  keymapError,
]);

async function invoke<TInput, TOutput>(
  ipcRenderer: Pick<IpcRenderer, 'invoke'>,
  channel: string,
  input: TInput,
  inputSchema: InputSchema<TInput>,
  resultSchema: InputSchema<Result<TOutput>>,
): Promise<Result<TOutput>> {
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) {
    return failure('invalid_input');
  }

  try {
    const result = await ipcRenderer.invoke(channel, parsedInput.data);
    const parsedResult = resultSchema.safeParse(result);
    return parsedResult.success ? parsedResult.data : failure('unavailable');
  } catch {
    return failure('unavailable');
  }
}
