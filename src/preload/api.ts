import type { IpcRenderer } from 'electron';
import type { ZodType } from 'zod';

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

export interface InkNoteApi {
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
