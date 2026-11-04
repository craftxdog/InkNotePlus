import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { isTrustedIpcEvent } from './note-handlers';
import {
  THEME_CHANNELS,
  themeNameInputSchema,
  registryInputSchema,
  customStylesSchema,
} from '../../shared/themes';
import type { ThemeService } from '../themes/theme-service';
import type { ThemeRegistry } from '../themes/theme-registry';
import { z } from '../../shared/validation';

export function registerThemeHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  service: ThemeService;
  registry: ThemeRegistry;
  getMainWebContents: () => WebContents | null;
  chooseFolder: () => Promise<string | undefined>;
  isActive: (name: string) => boolean;
}) {
  const { ipc, service, registry } = options;
  const channels: string[] = [];
  function handle<T>(
    channel: string,
    schema: z.ZodType<T>,
    run: (input: T) => unknown,
  ) {
    channels.push(channel);
    ipc.handle(channel, async (event: IpcMainInvokeEvent, input: unknown) => {
      if (!isTrustedIpcEvent(event, options.getMainWebContents()))
        return { ok: false, error: { code: 'unavailable' } };
      const parsed = schema.safeParse(input);
      if (!parsed.success)
        return { ok: false, error: { code: 'invalid_package' } };
      try {
        return { ok: true, data: await run(parsed.data) };
      } catch (error) {
        const code =
          error instanceof Error &&
          ['incompatible', 'invalid_package', 'cancelled'].includes(
            error.message,
          )
            ? error.message
            : 'unavailable';
        return { ok: false, error: { code } };
      }
    });
  }
  const empty = z.object({}).strict();
  handle(THEME_CHANNELS.list, empty, () => service.list());
  handle(THEME_CHANNELS.browse, registryInputSchema, (input) =>
    registry.browse(input),
  );
  // Serialize mutations so concurrent installs and removal cannot interleave.
  let queue = Promise.resolve<unknown>(undefined);
  const mutate = <T>(run: () => Promise<T>) => {
    const next = queue.then(run);
    queue = next.catch(() => {});
    return next;
  };
  handle(THEME_CHANNELS.install, themeNameInputSchema, ({ name }) =>
    mutate(async () =>
      service.importTarball(await registry.tarball(name), name),
    ),
  );
  handle(THEME_CHANNELS.import, empty, async () => {
    const folder = await options.chooseFolder();
    if (!folder) throw new Error('cancelled');
    return mutate(() => service.importFolder(folder));
  });
  handle(THEME_CHANNELS.remove, themeNameInputSchema, ({ name }) =>
    mutate(async () => {
      if (options.isActive(name)) throw new Error('invalid_package');
      await service.remove(name);
      return service.list();
    }),
  );
  handle(THEME_CHANNELS.stylesGet, empty, () => service.readStyles());
  handle(THEME_CHANNELS.stylesSet, customStylesSchema, (value) =>
    mutate(() => service.writeStyles(value)),
  );
  const watcher = service.watchStyles((value) => {
    const web = options.getMainWebContents();
    if (web && !web.isDestroyed())
      web.send(THEME_CHANNELS.stylesChanged, value);
  });
  return {
    dispose() {
      watcher.dispose();
      channels.forEach((channel) => ipc.removeHandler(channel));
    },
  };
}
