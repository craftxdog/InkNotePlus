export function createApiCredentials(options: {
  read: () => string | null;
  write: (value: string | null) => void;
  encryption: {
    isAvailable: () => boolean;
    encrypt: (text: string) => string;
    decrypt: (text: string) => string;
  };
  generate: () => string;
}) {
  let session: string | null = null;

  function store(password: string) {
    session = password;
    // Without a system keychain the password lasts only for this session.
    if (options.encryption.isAvailable())
      options.write(options.encryption.encrypt(password));
    return password;
  }

  return {
    password() {
      if (session) return session;
      const stored = options.read();
      if (stored && options.encryption.isAvailable()) {
        try {
          session = options.encryption.decrypt(stored);
          return session;
        } catch {
          return store(options.generate());
        }
      }
      return store(options.generate());
    },
    regenerate: () => store(options.generate()),
    persisted: () => options.encryption.isAvailable(),
  };
}
