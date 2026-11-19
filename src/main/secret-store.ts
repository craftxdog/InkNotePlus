export interface SecretEncryption {
  isAvailable: () => boolean;
  encrypt: (text: string) => string;
  decrypt: (text: string) => string;
}

// Without a system keychain a secret lasts only for this session.
export function createSecretStore(options: {
  read: () => string | null;
  write: (value: string | null) => void;
  encryption: SecretEncryption;
}) {
  let session: string | null = null;
  return {
    get() {
      if (session) return session;
      const stored = options.read();
      if (!stored || !options.encryption.isAvailable()) return null;
      try {
        session = options.encryption.decrypt(stored);
        return session;
      } catch {
        return null;
      }
    },
    set(value: string) {
      session = value;
      if (options.encryption.isAvailable())
        options.write(options.encryption.encrypt(value));
    },
    clear() {
      session = null;
      options.write(null);
    },
    persisted: () => options.encryption.isAvailable(),
  };
}
