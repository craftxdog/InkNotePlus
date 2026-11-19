import { describe, expect, it, vi } from 'vitest';
import { createAiService, type AiCompletion } from '../../src/main/ai/service';
import { AiProviderError } from '../../src/main/ai/compatible-provider';
import { createSecretStore } from '../../src/main/secret-store';

const requestId = '11111111-1111-4111-8111-111111111111';
const request = {
  requestId,
  kind: 'transform' as const,
  instruction: 'Resume',
  text: 'Texto',
};
const base = {
  aiEnabled: true,
  aiProvider: 'anthropic' as const,
  aiModel: 'claude-opus-5-5',
  aiBaseUrl: '',
};
function setup(settings = base, key: string | null = 'clave') {
  const complete = vi.fn(async (_input: AiCompletion) => 'Resultado');
  const service = createAiService({
    getSettings: () => settings,
    getKey: () => key,
    complete,
  });
  return { service, complete };
}

describe('AI service', () => {
  it('sends nothing while the assistant is off', async () => {
    const { service, complete } = setup({ ...base, aiEnabled: false });
    expect(await service.run(request)).toEqual({ status: 'disabled' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('requires a key for cloud providers', async () => {
    const { service, complete } = setup(base, null);
    expect(await service.run(request)).toEqual({ status: 'no_key' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('lets Ollama run without a key', async () => {
    const { service } = setup(
      { ...base, aiProvider: 'ollama', aiBaseUrl: '' } as never,
      null,
    );
    expect(await service.run(request)).toEqual({
      status: 'ok',
      text: 'Resultado',
    });
  });

  it('rejects an unsafe custom address', async () => {
    const { service, complete } = setup({
      ...base,
      aiProvider: 'openai',
      aiBaseUrl: 'http://api.example.com/v1',
    } as never);
    expect(await service.run(request)).toEqual({ status: 'bad_address' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('reports provider errors without details', async () => {
    const { service, complete } = setup();
    complete.mockRejectedValueOnce(new AiProviderError('rate_limit'));
    expect(await service.run(request)).toEqual({ status: 'rate_limit' });
    complete.mockRejectedValueOnce(new Error('clave secreta en el error'));
    expect(await service.run(request)).toEqual({ status: 'failed' });
  });

  it('cancels a running request', async () => {
    const { service, complete } = setup();
    complete.mockImplementationOnce(
      ({ signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('x', 'AbortError')),
          ),
        ),
    );
    const running = service.run(request);
    await Promise.resolve();
    service.cancel(requestId);
    expect(await running).toEqual({ status: 'cancelled' });
  });
});

describe('secret store', () => {
  const encryption = {
    isAvailable: () => true,
    encrypt: (text: string) => `x:${text}`,
    decrypt: (text: string) => text.slice(2),
  };
  it('stores secrets encrypted and clears them', () => {
    let stored: string | null = null;
    const store = createSecretStore({
      read: () => stored,
      write: (value) => (stored = value),
      encryption,
    });
    expect(store.get()).toBeNull();
    store.set('clave');
    expect(stored).toBe('x:clave');
    expect(store.get()).toBe('clave');
    store.clear();
    expect(stored).toBeNull();
    expect(store.get()).toBeNull();
  });

  it('keeps a secret only in memory without a keychain', () => {
    const write = vi.fn();
    const store = createSecretStore({
      read: () => null,
      write,
      encryption: { ...encryption, isAvailable: () => false },
    });
    store.set('clave');
    expect(store.get()).toBe('clave');
    expect(write).not.toHaveBeenCalled();
  });

  it('treats an unreadable secret as missing', () => {
    const store = createSecretStore({
      read: () => 'dañado',
      write: () => {},
      encryption: {
        ...encryption,
        decrypt: () => {
          throw new Error('corrupt');
        },
      },
    });
    expect(store.get()).toBeNull();
  });
});
