import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import type { ZodType } from 'zod';
import { failure, success } from '../../shared/ipc';
import {
  SYNC_CHANNELS,
  syncConnectSchema,
  syncDiagnoseSchema,
  type SyncConnectInput,
  type SyncDiagnostic,
  type SyncErrorStatus,
  type SyncStatus,
} from '../../shared/sync';
import { z } from '../../shared/validation';
import { isTrustedIpcEvent } from './note-handlers';

export function registerSyncHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  getMainWebContents: () => WebContents | null;
  status: () => SyncStatus;
  connect: (
    input: SyncConnectInput,
  ) => Promise<{ error: SyncErrorStatus | null }>;
  disconnect: () => void;
  run: () => Promise<void>;
  diagnose: (
    input: z.output<typeof syncDiagnoseSchema>,
  ) => Promise<SyncDiagnostic[]>;
}) {
  const channels: string[] = [];
  function handle<T>(
    channel: string,
    schema: ZodType<T>,
    run: (input: T) => unknown,
  ) {
    options.ipc.handle(
      channel,
      async (event: IpcMainInvokeEvent, input: unknown) => {
        if (!isTrustedIpcEvent(event, options.getMainWebContents()))
          return failure('unavailable');
        const parsed = schema.safeParse(input);
        if (!parsed.success) return failure('invalid_input');
        try {
          return success(await run(parsed.data));
        } catch {
          return failure('unavailable');
        }
      },
    );
    channels.push(channel);
  }
  handle(SYNC_CHANNELS.status, z.undefined(), options.status);
  handle(SYNC_CHANNELS.connect, syncConnectSchema, options.connect);
  handle(SYNC_CHANNELS.disconnect, z.undefined(), () => {
    options.disconnect();
    return options.status();
  });
  handle(SYNC_CHANNELS.run, z.undefined(), async () => {
    await options.run();
    return options.status();
  });
  handle(SYNC_CHANNELS.diagnose, syncDiagnoseSchema, options.diagnose);
  return {
    dispose() {
      for (const channel of channels) options.ipc.removeHandler(channel);
    },
  };
}
