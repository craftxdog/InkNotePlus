import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import type { ZodType } from 'zod';

import { type CommandRegistry } from '../../application/command-registry';
import type { Disposable } from '../../application/disposable';
import { NOTE_COMMAND_IDS } from '../../application/note-commands';
import {
  IPC_CHANNELS,
  createNoteInputSchema,
  affectedCountSchema,
  failure,
  listNotesInputSchema,
  manageTrashSchema,
  noteChangedEventSchema,
  noteIdInputSchema,
  noteListSchema,
  noteSchema,
  searchNotesInputSchema,
  success,
  updateNoteInputSchema,
  type NoteChangedEvent,
  type Result,
} from '../../shared/ipc';

type InvokeHandler = (
  event: IpcMainInvokeEvent,
  input: unknown,
) => Promise<Result<unknown>>;

type InputSchema<T> = Pick<ZodType<T>, 'safeParse'>;

interface NoteIpcHandlerOptions {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  commands: CommandRegistry;
  getMainWebContents: () => WebContents | null;
  publishNoteChanged?: (event: NoteChangedEvent) => void;
  onTrashChanged?: () => void;
}

export function registerNoteIpcHandlers(
  options: NoteIpcHandlerOptions,
): Disposable {
  const manageTrash = createInvokeHandler(
    options,
    manageTrashSchema,
    NOTE_COMMAND_IDS.manageTrash,
    affectedCountSchema,
  );
  const handlers: readonly [string, InvokeHandler][] = [
    [
      IPC_CHANNELS.notes.create,
      createMutationHandler(
        options,
        createNoteInputSchema,
        NOTE_COMMAND_IDS.create,
        'created',
      ),
    ],
    [
      IPC_CHANNELS.notes.update,
      createMutationHandler(
        options,
        updateNoteInputSchema,
        NOTE_COMMAND_IDS.update,
        'updated',
      ),
    ],
    [
      IPC_CHANNELS.notes.list,
      createInvokeHandler(
        options,
        listNotesInputSchema,
        NOTE_COMMAND_IDS.list,
        noteListSchema,
      ),
    ],
    [
      IPC_CHANNELS.notes.search,
      createInvokeHandler(
        options,
        searchNotesInputSchema,
        NOTE_COMMAND_IDS.search,
        noteListSchema,
      ),
    ],
    [
      IPC_CHANNELS.notes.moveToTrash,
      createMutationHandler(
        options,
        noteIdInputSchema,
        NOTE_COMMAND_IDS.moveToTrash,
        'trashed',
      ),
    ],
    [
      IPC_CHANNELS.notes.restore,
      createMutationHandler(
        options,
        noteIdInputSchema,
        NOTE_COMMAND_IDS.restore,
        'restored',
      ),
    ],
    [
      IPC_CHANNELS.notes.manageTrash,
      async (event, input) => {
        const result = await manageTrash(event, input);
        if (result.ok && result.data > 0) options.onTrashChanged?.();
        return result;
      },
    ],
  ];
  const registeredChannels: string[] = [];

  try {
    for (const [channel, handler] of handlers) {
      options.ipc.handle(channel, handler);
      registeredChannels.push(channel);
    }
  } catch (error) {
    for (const channel of registeredChannels.toReversed()) {
      options.ipc.removeHandler(channel);
    }
    throw error;
  }

  let disposed = false;
  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const channel of registeredChannels.toReversed()) {
        options.ipc.removeHandler(channel);
      }
    },
  };
}

export function isTrustedIpcEvent(
  event: IpcMainInvokeEvent,
  expectedWebContents: WebContents | null,
): boolean {
  return (
    expectedWebContents !== null &&
    event.sender === expectedWebContents &&
    event.senderFrame === expectedWebContents.mainFrame
  );
}

function createMutationHandler<TInput>(
  options: NoteIpcHandlerOptions,
  inputSchema: InputSchema<TInput>,
  commandId: string,
  type: NoteChangedEvent['type'],
): InvokeHandler {
  const invoke = createInvokeHandler(
    options,
    inputSchema,
    commandId,
    noteSchema,
  );

  return async (event, input) => {
    const result = await invoke(event, input);
    if (result.ok) {
      const parsedEvent = noteChangedEventSchema.parse({
        type,
        note: result.data,
      });
      options.publishNoteChanged?.(parsedEvent);
    }

    return result;
  };
}

function createInvokeHandler<TInput, TOutput>(
  options: NoteIpcHandlerOptions,
  inputSchema: InputSchema<TInput>,
  commandId: string,
  outputSchema: InputSchema<TOutput>,
): (event: IpcMainInvokeEvent, input: unknown) => Promise<Result<TOutput>> {
  return async (event, input) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents())) {
      return failure('unavailable');
    }

    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success) {
      return failure('invalid_input');
    }

    try {
      const execution = await options.commands.execute<Result<TOutput>>(
        commandId,
        parsedInput.data,
      );
      if (!execution.ok) {
        return failure('unavailable');
      }

      if (!execution.data.ok) {
        return execution.data;
      }

      const parsedOutput = outputSchema.safeParse(execution.data.data);
      if (!parsedOutput.success) {
        return failure('unavailable');
      }

      return success(parsedOutput.data);
    } catch {
      return failure('unavailable');
    }
  };
}
