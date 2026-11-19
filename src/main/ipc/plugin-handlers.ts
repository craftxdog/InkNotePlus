import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { dialog, shell } from 'electron';
import type { ZodType } from 'zod';
import { failure, success } from '../../shared/ipc';
import { PLUGIN_CHANNELS, pluginNameSchema } from '../../shared/plugins';
import { z } from '../../shared/validation';
import type { createPluginStore } from '../plugins/plugin-store';
import { isTrustedIpcEvent } from './note-handlers';

export function registerPluginHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  getWindow: () => BrowserWindow | null;
  store: ReturnType<typeof createPluginStore>;
}) {
  const { store } = options;
  const channels: string[] = [];
  function handle<T>(
    channel: string,
    schema: ZodType<T>,
    run: (input: T) => unknown,
  ) {
    options.ipc.handle(
      channel,
      async (event: IpcMainInvokeEvent, input: unknown) => {
        if (!isTrustedIpcEvent(event, options.getWindow()?.webContents ?? null))
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
  handle(PLUGIN_CHANNELS.list, z.undefined(), () => store.list());
  handle(PLUGIN_CHANNELS.install, z.undefined(), async () => {
    const window = options.getWindow();
    if (!window) return null;
    const choice = await dialog.showOpenDialog(window, {
      title: 'Instalar plugin',
      properties: ['openDirectory'],
    });
    return choice.canceled || !choice.filePaths[0]
      ? null
      : store.install(choice.filePaths[0]);
  });
  handle(PLUGIN_CHANNELS.remove, pluginNameSchema, (name) => {
    store.remove(name);
    return true;
  });
  // The name "init" asks for the user's own startup script.
  handle(PLUGIN_CHANNELS.load, pluginNameSchema, (name) =>
    name === 'init' ? store.loadInit() : store.load(name),
  );
  handle(PLUGIN_CHANNELS.openInit, z.undefined(), async () => {
    return !(await shell.openPath(store.ensureInit()));
  });
  return {
    dispose() {
      for (const channel of channels) options.ipc.removeHandler(channel);
    },
  };
}
