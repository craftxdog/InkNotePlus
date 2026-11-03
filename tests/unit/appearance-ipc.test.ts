import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { Configuration } from '../../src/application/config';
import { coreConfig } from '../../src/application/core-config';
import { registerPreferencesHandlers } from '../../src/main/ipc/preferences-handlers';
import { registerExternalLinkHandler } from '../../src/main/ipc/external-link-handler';
import { EXTERNAL_LINK_CHANNEL } from '../../src/shared/external-link';
import { PREFERENCES_CHANNELS } from '../../src/shared/preferences';
import { createContentSecurityPolicy } from '../../src/main/security';

function setup() {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, input: unknown) => unknown
  >();
  const ipc = {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, input: unknown) => unknown,
    ) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as Pick<IpcMain, 'handle' | 'removeHandler'>;
  const frame = {};
  const webContents = { mainFrame: frame } as WebContents;
  const event = {
    sender: webContents,
    senderFrame: frame,
  } as IpcMainInvokeEvent;
  const writes: unknown[] = [];
  const configuration = new Configuration({
    read: () => ({}),
    write: (value) => {
      writes.push(value);
    },
  });
  configuration.register(coreConfig.appearance);
  const openExternal = vi.fn(async (_url: string) => {});
  const preferences = registerPreferencesHandlers({
    ipc,
    configuration,
    getMainWebContents: () => webContents,
    platform: 'darwin',
    styleNonce: 'testNonce012345678901234567890123',
  });
  const links = registerExternalLinkHandler({
    ipc,
    getMainWebContents: () => webContents,
    openExternal,
  });
  const invoke = (channel: string, input: unknown, sender = event) =>
    handlers.get(channel)!(sender, input);
  return {
    invoke,
    writes,
    configuration,
    event,
    openExternal,
    preferences,
    links,
    handlers,
  };
}

describe('appearance and external link IPC', () => {
  it('persists partial preferences without resetting another field', async () => {
    const test = setup();
    await test.invoke(PREFERENCES_CHANNELS.update, { splitRatio: 65 });
    await test.invoke(PREFERENCES_CHANNELS.update, { theme: 'inknote-dark' });
    expect(test.configuration.get(coreConfig.appearance)).toMatchObject({
      splitRatio: 65,
      theme: 'inknote-dark',
    });
    expect(test.writes).toHaveLength(2);
    expect(test.invoke(PREFERENCES_CHANNELS.get, {})).toMatchObject({
      ok: true,
      data: {
        platform: 'darwin',
        styleNonce: 'testNonce012345678901234567890123',
      },
    });
    expect(
      test.invoke(PREFERENCES_CHANNELS.update, { sidebarWidth: 10 }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(
      test.invoke(PREFERENCES_CHANNELS.update, { arbitraryCss: 'bad' }),
    ).toMatchObject({ ok: false });
    test.preferences.dispose();
    test.links.dispose();
    expect(test.handlers.size).toBe(0);
  });

  it('rejects subframes and opens only explicitly allowed web URLs', async () => {
    const test = setup();
    const subframe = { ...test.event, senderFrame: {} } as IpcMainInvokeEvent;
    expect(
      await test.invoke(PREFERENCES_CHANNELS.get, {}, subframe),
    ).toMatchObject({ ok: false });
    expect(
      await test.invoke(
        EXTERNAL_LINK_CHANNEL,
        { url: 'https://example.com' },
        subframe,
      ),
    ).toMatchObject({ ok: false });
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:password@example.com',
      'data:text/html,hi',
    ]) {
      expect(await test.invoke(EXTERNAL_LINK_CHANNEL, { url })).toMatchObject({
        ok: false,
      });
    }
    expect(test.openExternal).not.toHaveBeenCalled();
    expect(
      await test.invoke(EXTERNAL_LINK_CHANNEL, {
        url: 'https://example.com/docs',
      }),
    ).toMatchObject({ ok: true });
    expect(test.openExternal).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/docs',
    );
  });

  it('authorizes editor styles with a nonce while keeping production scripts strict', () => {
    const policy = createContentSecurityPolicy(
      false,
      undefined,
      'testNonce012345678901234567890123',
    );
    expect(policy).toContain(
      "style-src 'self' 'nonce-testNonce012345678901234567890123'",
    );
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain('unsafe-inline');
  });
});
