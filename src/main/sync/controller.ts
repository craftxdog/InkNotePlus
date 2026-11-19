import type {
  SyncConnectInput,
  SyncConnection,
  SyncErrorStatus,
  SyncStatus,
} from '../../shared/sync';
import type { SyncResult } from './engine';
import { SyncError } from './errors';

export interface StoredSync {
  connection: SyncConnection;
  password: string;
  key: string;
}

const startupDelay = 2000;
const changeDelay = 5000;
const interval = 5 * 60_000;

const errorCode = (error: unknown): SyncErrorStatus =>
  error instanceof SyncError ? error.code : 'failed';

export function createSyncController(options: {
  load: () => StoredSync | null;
  save: (value: StoredSync) => void;
  clear: () => void;
  persisted: () => boolean;
  run: (stored: StoredSync) => Promise<SyncResult>;
  unlock: (input: SyncConnectInput) => Promise<Buffer>;
  reset: () => void;
  onStatus: (status: SyncStatus) => void;
}) {
  let syncing = false;
  let again = false;
  let error: SyncErrorStatus | null = null;
  let lastSyncAt: string | null = null;
  let lastResult: SyncResult | null = null;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  let current: Promise<void> = Promise.resolve();

  const status = (): SyncStatus => {
    const stored = options.load();
    return {
      configured: !!stored,
      persisted: options.persisted(),
      connection: stored?.connection ?? null,
      state: !stored ? 'off' : syncing ? 'syncing' : error ? 'error' : 'idle',
      error: stored ? error : null,
      lastSyncAt,
      lastResult,
    };
  };
  const announce = () => options.onStatus(status());

  async function cycle() {
    do {
      again = false;
      const stored = options.load();
      if (!stored || disposed) break;
      announce();
      try {
        lastResult = await options.run(stored);
        lastSyncAt = new Date().toISOString();
        error = null;
      } catch (cause) {
        error = errorCode(cause);
      }
    } while (again && !disposed);
    syncing = false;
    if (!disposed) announce();
  }

  function runNow() {
    if (syncing) {
      again = true;
      return current;
    }
    syncing = true;
    current = cycle();
    return current;
  }

  return {
    status,
    runNow,
    savedPassword: () => options.load()?.password ?? null,
    start() {
      if (!options.load()) return;
      startTimer = setTimeout(() => void runNow(), startupDelay);
      repeat = setInterval(() => void runNow(), interval);
    },
    // Local edits wait for a pause so a typing burst becomes one upload.
    schedule() {
      if (disposed || !options.load()) return;
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => void runNow(), changeDelay);
    },
    async connect(input: SyncConnectInput) {
      try {
        const key = await options.unlock(input);
        const { url, username, database, password } = input;
        options.reset();
        options.save({
          connection: { url, username, database },
          password,
          key: key.toString('base64'),
        });
      } catch (cause) {
        return { error: errorCode(cause) };
      }
      error = null;
      clearInterval(repeat);
      repeat = setInterval(() => void runNow(), interval);
      void runNow();
      return { error: null };
    },
    disconnect() {
      clearTimeout(changeTimer);
      clearTimeout(startTimer);
      clearInterval(repeat);
      options.clear();
      options.reset();
      error = null;
      lastSyncAt = null;
      lastResult = null;
      announce();
    },
    dispose() {
      disposed = true;
      clearTimeout(changeTimer);
      clearTimeout(startTimer);
      clearInterval(repeat);
    },
  };
}
