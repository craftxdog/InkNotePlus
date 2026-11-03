import type { ZodType } from 'zod';

import type { Disposable } from './disposable';

const configKeyPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][A-Za-z0-9-]*)+$/;

export interface ConfigStorage {
  read(): Record<string, unknown>;
  write(values: Readonly<Record<string, unknown>>): void;
}

export interface ConfigDefinition<T> {
  readonly key: string;
  readonly schema: ZodType<T>;
  readonly defaultValue: T;
}

export interface ConfigChange<T> {
  readonly oldValue: T;
  readonly newValue: T;
}

export class InvalidConfigDefinitionError extends Error {
  constructor() {
    super('Invalid configuration definition.');
    this.name = 'InvalidConfigDefinitionError';
  }
}

export class DuplicateConfigKeyError extends Error {
  constructor(key: string) {
    super(`Configuration key is already registered: ${key}`);
    this.name = 'DuplicateConfigKeyError';
  }
}

export class UnknownConfigKeyError extends Error {
  constructor(key: string) {
    super(`Configuration key is not registered: ${key}`);
    this.name = 'UnknownConfigKeyError';
  }
}

export class InvalidConfigValueError extends Error {
  constructor(key: string) {
    super(`Configuration value is invalid: ${key}`);
    this.name = 'InvalidConfigValueError';
  }
}

interface RegisteredConfig {
  readonly token: symbol;
  readonly definition: ConfigDefinition<unknown>;
  value: unknown;
  readonly observers: Set<(value: unknown) => void>;
  readonly changeListeners: Set<(change: ConfigChange<unknown>) => void>;
}

export function defineConfig<T>(
  definition: ConfigDefinition<T>,
): ConfigDefinition<T> {
  validateDefinition(definition);
  return Object.freeze({ ...definition });
}

export class Configuration {
  readonly #registered = new Map<string, RegisteredConfig>();
  #storedValues: Record<string, unknown>;

  constructor(private readonly storage: ConfigStorage) {
    this.#storedValues = cloneConfigRecord(storage.read());
  }

  register<T>(definition: ConfigDefinition<T>): Disposable {
    validateDefinition(definition);
    if (this.#registered.has(definition.key)) {
      throw new DuplicateConfigKeyError(definition.key);
    }

    const defaultValue = parseDefaultValue(definition);
    const parsedStoredValue = Object.hasOwn(this.#storedValues, definition.key)
      ? definition.schema.safeParse(this.#storedValues[definition.key])
      : null;
    const value =
      parsedStoredValue?.success === true
        ? parsedStoredValue.data
        : defaultValue;
    const entry: RegisteredConfig = {
      token: Symbol(definition.key),
      definition: definition as ConfigDefinition<unknown>,
      value,
      observers: new Set(),
      changeListeners: new Set(),
    };
    this.#registered.set(definition.key, entry);

    return {
      dispose: () => {
        const current = this.#registered.get(definition.key);
        if (current?.token === entry.token) {
          current.observers.clear();
          current.changeListeners.clear();
          this.#registered.delete(definition.key);
        }
      },
    };
  }

  get<T>(definition: ConfigDefinition<T>): T {
    return this.getEntry(definition).value as T;
  }

  set<T>(definition: ConfigDefinition<T>, value: T): void {
    const entry = this.getEntry(definition);
    const parsedValue = definition.schema.safeParse(value);
    if (!parsedValue.success) {
      throw new InvalidConfigValueError(definition.key);
    }
    if (Object.is(entry.value, parsedValue.data)) {
      return;
    }

    const nextStoredValues = cloneConfigRecord(this.#storedValues);
    nextStoredValues[definition.key] = parsedValue.data;
    this.storage.write(nextStoredValues);
    this.#storedValues = nextStoredValues;

    const oldValue = entry.value as T;
    const newValue = parsedValue.data;
    entry.value = newValue;
    for (const observer of entry.observers) {
      observer(newValue);
    }
    for (const listener of entry.changeListeners) {
      listener({ oldValue, newValue });
    }
  }

  observe<T>(
    definition: ConfigDefinition<T>,
    observer: (value: T) => void,
  ): Disposable {
    const entry = this.getEntry(definition);
    const wrappedObserver = observer as (value: unknown) => void;
    entry.observers.add(wrappedObserver);
    observer(entry.value as T);

    return createSubscription(entry.observers, wrappedObserver);
  }

  onDidChange<T>(
    definition: ConfigDefinition<T>,
    listener: (change: ConfigChange<T>) => void,
  ): Disposable {
    const entry = this.getEntry(definition);
    const wrappedListener = listener as (change: ConfigChange<unknown>) => void;
    entry.changeListeners.add(wrappedListener);

    return createSubscription(entry.changeListeners, wrappedListener);
  }

  private getEntry<T>(definition: ConfigDefinition<T>): RegisteredConfig {
    const entry = this.#registered.get(definition.key);
    if (!entry || entry.definition !== definition) {
      throw new UnknownConfigKeyError(definition.key);
    }

    return entry;
  }
}

function validateDefinition<T>(definition: ConfigDefinition<T>): void {
  if (!configKeyPattern.test(definition.key)) {
    throw new InvalidConfigDefinitionError();
  }
  if (!definition.schema.safeParse(definition.defaultValue).success) {
    throw new InvalidConfigDefinitionError();
  }
}

function parseDefaultValue<T>(definition: ConfigDefinition<T>): T {
  const parsed = definition.schema.safeParse(definition.defaultValue);
  if (!parsed.success) {
    throw new InvalidConfigDefinitionError();
  }

  return parsed.data;
}

function cloneConfigRecord(
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const copy = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) {
    if (configKeyPattern.test(key)) {
      copy[key] = value;
    }
  }

  return copy;
}

function createSubscription<T>(listeners: Set<T>, listener: T): Disposable {
  let disposed = false;

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.delete(listener);
    },
  };
}
