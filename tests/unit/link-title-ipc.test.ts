import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { expect, it, vi } from 'vitest';
import { registerExternalLinkHandler } from '../../src/main/ipc/external-link-handler';
import { LINK_TITLE_CHANNEL } from '../../src/shared/external-link';

function setup() {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, input: unknown) => unknown
  >();
  const frame = {};
  const contents = { mainFrame: frame } as unknown as WebContents;
  const fetchTitle = vi.fn(async () => 'Título');
  const registration = registerExternalLinkHandler({
    ipc: {
      handle: (channel: string, handler: never) =>
        handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    } as unknown as Pick<IpcMain, 'handle' | 'removeHandler'>,
    getMainWebContents: () => contents,
    openExternal: async () => {},
    fetchTitle,
  });
  const invoke = (input: unknown, sender: unknown = contents) =>
    handlers.get(LINK_TITLE_CHANNEL)!(
      { sender, senderFrame: frame } as IpcMainInvokeEvent,
      input,
    );
  return { handlers, invoke, fetchTitle, registration };
}

it('returns the title for a valid request from the main window', async () => {
  const { invoke, fetchTitle } = setup();
  await expect(invoke({ url: 'https://example.com/' })).resolves.toEqual({
    ok: true,
    data: 'Título',
  });
  expect(fetchTitle).toHaveBeenCalledWith('https://example.com/');
});

it('rejects other senders and unsafe URLs without any request', async () => {
  const { invoke, fetchTitle } = setup();
  await expect(
    invoke({ url: 'https://example.com/' }, {}),
  ).resolves.toMatchObject({ ok: false });
  await expect(invoke({ url: 'file:///etc/passwd' })).resolves.toMatchObject({
    ok: false,
    error: { code: 'invalid_input' },
  });
  expect(fetchTitle).not.toHaveBeenCalled();
});

it('removes the channel on dispose', () => {
  const { handlers, registration } = setup();
  registration.dispose();
  expect(handlers.has(LINK_TITLE_CHANNEL)).toBe(false);
});
