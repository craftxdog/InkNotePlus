import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncController } from '../../src/main/sync/controller';
import { SyncError } from '../../src/main/sync/errors';
import { diagnoseConnection } from '../../src/main/sync/diagnostics';
import { createFakeCouch } from '../support/fake-couch';

const connection = {
  url: 'https://couch.example',
  username: 'u',
  database: 'inknote',
};
const result = {
  pushed: 1,
  pulled: 0,
  conflicts: 0,
  unreadable: 0,
  skippedFiles: 0,
};

function setup(saved = true) {
  let stored = saved
    ? { connection, password: 'p', key: Buffer.alloc(32).toString('base64') }
    : null;
  const run = vi.fn(async () => result);
  const unlock = vi.fn(async () => Buffer.alloc(32, 1));
  const reset = vi.fn();
  const onStatus = vi.fn();
  const controller = createSyncController({
    load: () => stored,
    save: (value) => {
      stored = value;
    },
    clear: () => {
      stored = null;
    },
    persisted: () => true,
    run,
    unlock,
    reset,
    onStatus,
  });
  return { controller, run, unlock, reset, onStatus, stored: () => stored };
}
const input = { ...connection, password: 'p', passphrase: 'frase larga' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sync controller', () => {
  it('stays off without a connection', async () => {
    const { controller, run } = setup(false);
    controller.start();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(run).not.toHaveBeenCalled();
    expect(controller.status()).toMatchObject({
      state: 'off',
      configured: false,
    });
  });

  it('does not touch the system keychain without a connection', () => {
    const persisted = vi.fn(() => true);
    const controller = createSyncController({
      load: () => null,
      save: () => {},
      clear: () => {},
      persisted,
      run: async () => result,
      unlock: async () => Buffer.alloc(32),
      reset: () => {},
      onStatus: () => {},
    });
    controller.start();
    controller.status();
    expect(persisted).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('never exposes the password or key in its status', () => {
    const { controller } = setup();
    const text = JSON.stringify(controller.status());
    expect(text).not.toContain('AAAAAAAA');
    expect(controller.status()).not.toHaveProperty('password');
  });

  it('syncs at startup and periodically', async () => {
    const { controller, run } = setup();
    controller.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('groups local changes into one sync', async () => {
    const { controller, run } = setup();
    controller.schedule();
    controller.schedule();
    await vi.advanceTimersByTimeAsync(4000);
    controller.schedule();
    await vi.advanceTimersByTimeAsync(5100);
    expect(run).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('runs again when a change arrives during a sync', async () => {
    const { controller, run } = setup();
    let finish = () => {};
    run.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve(result))),
    );
    const first = controller.runNow();
    await vi.advanceTimersByTimeAsync(0);
    const second = controller.runNow();
    finish();
    await Promise.all([first, second]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('reports the failure and recovers on the next run', async () => {
    const { controller, run } = setup();
    run.mockRejectedValueOnce(new SyncError('unreachable'));
    await controller.runNow();
    expect(controller.status()).toMatchObject({
      state: 'error',
      error: 'unreachable',
    });
    await controller.runNow();
    expect(controller.status()).toMatchObject({ state: 'idle', error: null });
    controller.dispose();
  });

  it('saves a new connection only after unlocking it', async () => {
    const { controller, unlock, stored } = setup(false);
    unlock.mockRejectedValueOnce(new SyncError('wrong_passphrase'));
    expect(await controller.connect(input)).toEqual({
      error: 'wrong_passphrase',
    });
    expect(stored()).toBeNull();
    expect(await controller.connect(input)).toEqual({ error: null });
    expect(stored()?.connection).toEqual(connection);
    expect(JSON.stringify(stored())).not.toContain('frase larga');
    controller.dispose();
  });

  it('forgets the sync state when disconnecting', async () => {
    const { controller, reset, stored } = setup();
    controller.disconnect();
    expect(stored()).toBeNull();
    expect(reset).toHaveBeenCalledOnce();
    expect(controller.status().state).toBe('off');
  });

  it('stops all timers on dispose', async () => {
    const { controller, run } = setup();
    controller.start();
    controller.dispose();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('connection diagnostics', () => {
  beforeEach(() => vi.useRealTimers());
  const base = {
    url: 'http://127.0.0.1:5984',
    username: 'u',
    password: 'p',
    database: 'inknote',
    resolveProxy: async () => 'DIRECT',
  };

  it('passes every step on a working server', async () => {
    const { fetcher } = createFakeCouch();
    const steps = await diagnoseConnection({ ...base, fetcher });
    expect(steps.map(({ step, ok }) => [step, ok])).toEqual([
      ['address', true],
      ['proxy', true],
      ['server', true],
      ['login', true],
    ]);
  });

  it('works with a server that requires a login everywhere', async () => {
    const { fetcher } = createFakeCouch();
    const protectedServer = (async (input, init) => {
      const headers = new Headers(init?.headers);
      return headers.get('authorization')
        ? fetcher(input, init)
        : new Response('{}', { status: 401 });
    }) as typeof fetch;
    const steps = await diagnoseConnection({
      ...base,
      fetcher: protectedServer,
    });
    expect(steps.every(({ ok }) => ok)).toBe(true);
  });

  it('reports a rejected login on a protected server', async () => {
    const steps = await diagnoseConnection({
      ...base,
      fetcher: (async () => new Response('{}', { status: 401 })) as never,
    });
    expect(steps.at(-2)).toMatchObject({ step: 'server', ok: true });
    expect(steps.at(-1)).toMatchObject({ step: 'login', ok: false });
  });

  it('stops at an insecure address', async () => {
    const steps = await diagnoseConnection({
      ...base,
      url: 'http://couch.example',
      fetcher: fetch,
    });
    expect(steps).toEqual([
      { step: 'address', ok: false, detail: expect.any(String) },
    ]);
  });

  it('names the failing login without showing the password', async () => {
    const { fetcher } = createFakeCouch();
    const steps = await diagnoseConnection({
      ...base,
      password: 'clave-mala',
      fetcher,
    });
    expect(steps.at(-1)).toMatchObject({ step: 'login', ok: false });
    expect(JSON.stringify(steps)).not.toContain('clave-mala');
  });

  it('reports an unreachable server and the proxy in use', async () => {
    const steps = await diagnoseConnection({
      ...base,
      resolveProxy: async () => 'PROXY corp.example:8080',
      fetcher: (async () => {
        throw new Error('ECONNREFUSED');
      }) as never,
    });
    expect(steps[1]).toMatchObject({
      step: 'proxy',
      ok: true,
      detail: 'PROXY corp.example:8080',
    });
    expect(steps.at(-1)).toMatchObject({ step: 'server', ok: false });
  });
});
