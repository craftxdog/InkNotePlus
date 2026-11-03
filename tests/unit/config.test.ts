import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import {
  Configuration,
  DuplicateConfigKeyError,
  InvalidConfigValueError,
  defineConfig,
  type ConfigStorage,
} from '../../src/application/config';

const windowMinimumWidth = defineConfig({
  key: 'core.window.minimumWidth',
  schema: z.number().int().min(480).max(1_600),
  defaultValue: 640,
});

class MemoryConfigStorage implements ConfigStorage {
  readonly writes: Record<string, unknown>[] = [];

  constructor(private values: Record<string, unknown> = {}) {}

  read(): Record<string, unknown> {
    return { ...this.values };
  }

  write(values: Readonly<Record<string, unknown>>): void {
    this.values = { ...values };
    this.writes.push({ ...values });
  }
}

describe('Configuration', () => {
  it('loads a valid namespaced value and falls back to its schema default', () => {
    const storage = new MemoryConfigStorage({
      'core.window.minimumWidth': 720,
      'core.window.minimumHeight': 'not-a-number',
    });
    const minimumHeight = defineConfig({
      key: 'core.window.minimumHeight',
      schema: z.number().int().min(320).max(1_200),
      defaultValue: 480,
    });
    const config = new Configuration(storage);

    config.register(windowMinimumWidth);
    config.register(minimumHeight);

    expect(config.get(windowMinimumWidth)).toBe(720);
    expect(config.get(minimumHeight)).toBe(480);
  });

  it('persists a validated change before notifying observers', () => {
    const storage = new MemoryConfigStorage();
    const config = new Configuration(storage);
    config.register(windowMinimumWidth);
    const observed: number[] = [];
    const changed: Array<{ oldValue: number; newValue: number }> = [];

    config.observe(windowMinimumWidth, (value) => observed.push(value));
    config.onDidChange(windowMinimumWidth, (change) => {
      changed.push(change);
      expect(storage.writes).toEqual([{ 'core.window.minimumWidth': 800 }]);
    });
    config.set(windowMinimumWidth, 800);

    expect(observed).toEqual([640, 800]);
    expect(changed).toEqual([{ oldValue: 640, newValue: 800 }]);
    expect(config.get(windowMinimumWidth)).toBe(800);
  });

  it('rejects invalid values and duplicate registrations', () => {
    const config = new Configuration(new MemoryConfigStorage());
    config.register(windowMinimumWidth);

    expect(() => config.set(windowMinimumWidth, 479)).toThrow(
      InvalidConfigValueError,
    );
    expect(() => config.register(windowMinimumWidth)).toThrow(
      DuplicateConfigKeyError,
    );
  });
});
