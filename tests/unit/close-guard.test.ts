import { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { expect, it } from 'vitest';
import { installCloseGuard } from '../../src/main/close-guard';
import { WINDOW_CHANNELS } from '../../src/shared/window-lifecycle';

it('keeps the window open after failed persistence and accepts only a trusted matching confirmation', async () => {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, input: unknown) => unknown
  >();
  const messages: unknown[] = [];
  const frame = {};
  const contents = {
    mainFrame: frame,
    send: (_channel: string, value: unknown) => messages.push(value),
  };
  const window = new EventEmitter() as EventEmitter & {
    webContents: typeof contents;
    close: () => void;
    isDestroyed: () => boolean;
  };
  window.webContents = contents;
  let closed = false;
  window.isDestroyed = () => closed;
  window.close = () => {
    let prevented = false;
    window.emit('close', {
      preventDefault: () => {
        prevented = true;
      },
    });
    if (!prevented) {
      closed = true;
      window.emit('closed');
    }
  };
  const ipc = {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, input: unknown) => unknown,
    ) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  };
  installCloseGuard(
    window as unknown as BrowserWindow,
    ipc as Pick<IpcMain, 'handle' | 'removeHandler'>,
  );
  const event = {
    sender: contents,
    senderFrame: frame,
  } as unknown as IpcMainInvokeEvent;
  handlers.get(WINDOW_CHANNELS.readiness)!(event, { ready: true });
  window.close();
  expect(closed).toBe(false);
  const first = messages[0] as { requestId: string };
  expect(
    handlers.get(WINDOW_CHANNELS.confirm)!(
      { ...event, senderFrame: {} } as unknown as IpcMainInvokeEvent,
      { ...first, saved: true },
    ),
  ).toMatchObject({ ok: false });
  expect(
    handlers.get(WINDOW_CHANNELS.confirm)!(event, {
      requestId: 'wrong',
      saved: true,
    }),
  ).toMatchObject({ ok: false });
  handlers.get(WINDOW_CHANNELS.confirm)!(event, { ...first, saved: false });
  expect(closed).toBe(false);
  window.close();
  const next = messages[1] as { requestId: string };
  handlers.get(WINDOW_CHANNELS.confirm)!(event, { ...next, saved: true });
  await new Promise((resolve) => setImmediate(resolve));
  expect(closed).toBe(true);
  expect(handlers.size).toBe(0);
});
