import type { LocalApiStatus } from '../../shared/local-api';

interface ApiServer {
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}
interface Settings {
  enabled: boolean;
  port: number;
}

export const localApiUsername = 'inknote';

export function createLocalApiController(options: {
  createServer: (password: string) => ApiServer;
  credentials: {
    password(): string;
    regenerate(): string;
    persisted(): boolean;
  };
  onChange: (status: LocalApiStatus) => void;
}) {
  let server: ApiServer | null = null;
  let settings: Settings = { enabled: false, port: 0 };
  let error: LocalApiStatus['error'] = null;
  let queue: Promise<unknown> = Promise.resolve();

  const status = (): LocalApiStatus => ({
    enabled: settings.enabled,
    running: server !== null,
    port: settings.port,
    username: localApiUsername,
    // Reading the password can open the system keychain, so it waits for opt-in.
    password: settings.enabled ? options.credentials.password() : null,
    persisted: options.credentials.persisted(),
    error,
  });

  async function stop() {
    const current = server;
    server = null;
    await current?.close();
  }
  async function start() {
    error = null;
    if (!settings.enabled) return;
    const next = options.createServer(options.credentials.password());
    try {
      await next.listen(settings.port);
      server = next;
    } catch (cause) {
      error =
        (cause as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? 'port_in_use'
          : 'failed';
    }
  }
  // Starting and stopping share a port, so each change waits for the previous one.
  const enqueue = (task: () => Promise<void>) => {
    const run = queue.then(task).then(() => options.onChange(status()));
    queue = run.catch(() => {});
    return run;
  };

  return {
    status,
    apply: (next: Settings) =>
      enqueue(async () => {
        const same =
          next.enabled === settings.enabled && next.port === settings.port;
        if (same && (server || !next.enabled)) return;
        settings = next;
        await stop();
        await start();
      }),
    regenerate: () =>
      enqueue(async () => {
        options.credentials.regenerate();
        await stop();
        await start();
      }),
    dispose: () => {
      settings = { ...settings, enabled: false };
      queue = queue.then(stop);
      return queue as Promise<void>;
    },
  };
}
