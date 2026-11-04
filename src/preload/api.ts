import type { IpcRenderer } from 'electron';
import type { ZodType } from 'zod';
import {
  WINDOW_CHANNELS,
  closeRequestSchema,
  closeReadinessSchema,
  closeConfirmationSchema,
  closeResultSchema,
} from '../shared/window-lifecycle';
import {
  EXTERNAL_LINK_CHANNEL,
  externalLinkSchema,
  externalLinkResultSchema,
} from '../shared/external-link';
import {
  LIBRARY_CHANNELS,
  createNotebookSchema,
  libraryResultSchema,
  notebookResultSchema,
  libraryInputSchema,
  type LibraryInput,
  type CreateNotebookInput,
  type LibrarySnapshot,
  type Notebook,
} from '../shared/library';
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
  failure,
  listNotesInputSchema,
  noteChangedEventSchema,
  noteIdInputSchema,
  noteListResultSchema,
  noteResultSchema,
  searchNotesInputSchema,
  type CreateNoteInput,
  type ListNotesInput,
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
  onBeforeClose(listener: () => Promise<boolean>): () => void;
  links: { openExternal(url: string): Promise<Result<boolean>> };
  library: {
    get(input?: LibraryInput): Promise<Result<LibrarySnapshot>>;
    createNotebook(input: CreateNotebookInput): Promise<Result<Notebook>>;
    setNotebookIcon(input: SetNotebookIconInput): Promise<Result<Notebook>>;
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
  };
  onNoteChanged(listener: (event: NoteChangedEvent) => void): () => void;
}

export function createInkNoteApi(
  ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>,
): InkNoteApi {
  return {
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
}

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
