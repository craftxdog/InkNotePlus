import { describe, expect, it, vi } from 'vitest';
import { createApiCredentials } from '../../src/main/local-api/credentials';

const encryption = {
  isAvailable: () => true,
  encrypt: (text: string) => `cifrado:${text}`,
  decrypt: (text: string) => {
    if (!text.startsWith('cifrado:')) throw new Error('corrupt');
    return text.slice(8);
  },
};

function setup(initial: string | null = null, crypto = encryption) {
  let stored = initial;
  const write = vi.fn((value: string | null) => {
    stored = value;
  });
  let counter = 0;
  const credentials = createApiCredentials({
    read: () => stored,
    write,
    encryption: crypto,
    generate: () => `clave-${++counter}`,
  });
  return { credentials, write, stored: () => stored };
}

describe('local API credentials', () => {
  it('creates a password once and stores it encrypted', () => {
    const { credentials, stored, write } = setup();
    expect(credentials.password()).toBe('clave-1');
    expect(credentials.password()).toBe('clave-1');
    expect(stored()).toBe('cifrado:clave-1');
    expect(write).toHaveBeenCalledOnce();
  });

  it('reads the stored password', () => {
    const { credentials } = setup('cifrado:guardada');
    expect(credentials.password()).toBe('guardada');
  });

  it('replaces a password it cannot decrypt', () => {
    const { credentials, stored } = setup('dañada');
    expect(credentials.password()).toBe('clave-1');
    expect(stored()).toBe('cifrado:clave-1');
  });

  it('regenerates on demand', () => {
    const { credentials } = setup('cifrado:guardada');
    expect(credentials.regenerate()).toBe('clave-1');
    expect(credentials.password()).toBe('clave-1');
  });

  it('never writes plain text without system encryption', () => {
    const { credentials, stored, write } = setup(null, {
      ...encryption,
      isAvailable: () => false,
    });
    expect(credentials.password()).toBe('clave-1');
    expect(credentials.password()).toBe('clave-1');
    expect(stored()).toBeNull();
    expect(write).not.toHaveBeenCalled();
    expect(credentials.persisted()).toBe(false);
  });
});
