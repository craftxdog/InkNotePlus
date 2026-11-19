// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pluginRuntimeSource } from '../../src/main/plugins/host-page';

type Message = Record<string, unknown>;
let sent: Message[];
let deliver: (message: Message) => void;

function boot() {
  sent = [];
  const listeners: ((event: { data: Message; source: unknown }) => void)[] = [];
  const parent = { postMessage: (message: Message) => sent.push(message) };
  const fakeWindow = {
    addEventListener: (_type: string, listener: (typeof listeners)[number]) =>
      listeners.push(listener),
  };
  new Function('window', 'parent', pluginRuntimeSource)(fakeWindow, parent);
  deliver = (data) =>
    listeners.forEach((listener) => listener({ data, source: parent }));
}
const settle = () => new Promise((resolve) => setTimeout(resolve));
const start = async (files: Record<string, string>, main = 'index.js') => {
  deliver({ type: 'start', bundle: { name: 'p', main, files } });
  await settle();
  return sent.find(({ type }) => type === 'started' || type === 'failed');
};

beforeEach(boot);

describe('plugin runtime', () => {
  it('announces that it is ready', () => {
    expect(sent).toEqual([{ type: 'ready' }]);
  });

  it('activates a CommonJS plugin', async () => {
    const result = await start({
      'index.js': `module.exports = { activate() { globalThis.__active = require('./otro').valor; } };`,
      'otro.js': 'exports.valor = 7;',
    });
    expect(result).toEqual({ type: 'started' });
    expect((globalThis as Record<string, unknown>).__active).toBe(7);
  });

  it('activates a default export', async () => {
    const result = await start({
      'index.js': `exports.default = { activate() {} };`,
    });
    expect(result).toEqual({ type: 'started' });
  });

  it.each(['fs', 'electron', 'child_process', 'react'])(
    'explains that %s is unavailable',
    async (name) => {
      const result = await start({ 'index.js': `require('${name}');` });
      expect(result).toMatchObject({ type: 'failed' });
      expect(String(result?.message)).toContain(name);
    },
  );

  it('explains an unsupported Inkdrop API', async () => {
    const result = await start({
      'index.js': `module.exports = { activate() { inkdrop.layouts.addComponentToLayout('a', 'B'); } };`,
    });
    expect(result).toMatchObject({ type: 'failed' });
    expect(String(result?.message)).toContain('layouts');
  });

  it('reports a failing activation', async () => {
    const result = await start({
      'index.js': `module.exports = { activate() { throw new Error('rota'); } };`,
    });
    expect(result).toEqual({ type: 'failed', message: 'rota' });
  });

  it('registers and runs commands', async () => {
    await start({
      'index.js': `module.exports = { activate() {
        inkdrop.commands.add(document.body, { 'p:hola': () => { globalThis.__ran = true; } });
      } };`,
    });
    expect(sent).toContainEqual({ type: 'commands', names: ['p:hola'] });
    deliver({ type: 'command', name: 'p:hola' });
    expect((globalThis as Record<string, unknown>).__ran).toBe(true);
  });

  it('resolves host requests', async () => {
    await start({
      'index.js': `module.exports = { async activate() {
        globalThis.__note = await inkdrop.main.dataStore.getLocalDB().notes.get('note:1');
      } };`,
    });
    const request = sent.find(({ type }) => type === 'request')!;
    expect(request).toMatchObject({
      method: 'notes.get',
      params: { id: 'note:1' },
    });
    deliver({
      type: 'response',
      id: request.id,
      ok: true,
      value: { title: 'T' },
    });
    await settle();
    expect((globalThis as Record<string, unknown>).__note).toEqual({
      title: 'T',
    });
  });

  it('rejects host errors', async () => {
    await start({
      'index.js': `module.exports = { async activate() {
        globalThis.__error = await inkdrop.notifications.addInfo('x').catch((e) => e.message);
      } };`,
    });
    const request = sent.find(({ type }) => type === 'request')!;
    deliver({ type: 'response', id: request.id, ok: false, error: 'No' });
    await settle();
    expect((globalThis as Record<string, unknown>).__error).toBe('No');
  });

  it('deactivates on stop', async () => {
    await start({
      'index.js': `module.exports = { activate() {}, deactivate() { globalThis.__off = true; } };`,
    });
    deliver({ type: 'stop' });
    await settle();
    expect((globalThis as Record<string, unknown>).__off).toBe(true);
  });

  it('ignores messages from anyone but the app', async () => {
    const spy = vi.fn();
    (globalThis as Record<string, unknown>).__spy = spy;
    const listeners: ((event: { data: Message; source: unknown }) => void)[] =
      [];
    const parent = { postMessage: () => {} };
    new Function('window', 'parent', pluginRuntimeSource)(
      {
        addEventListener: (_t: string, l: (typeof listeners)[number]) =>
          listeners.push(l),
      },
      parent,
    );
    listeners[0]({
      data: {
        type: 'start',
        bundle: {
          name: 'x',
          main: 'i.js',
          files: { 'i.js': 'globalThis.__spy()' },
        },
      },
      source: {},
    });
    await settle();
    expect(spy).not.toHaveBeenCalled();
  });
});
