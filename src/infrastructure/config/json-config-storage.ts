import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ConfigStorage } from '../../application/config';

export class ConfigStorageError extends Error {
  constructor() {
    super('Configuration could not be read or written.');
    this.name = 'ConfigStorageError';
  }
}

export class JsonConfigStorage implements ConfigStorage {
  constructor(private readonly filePath: string) {}

  read(): Record<string, unknown> {
    let source: string;
    try {
      source = readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (isMissingFileError(error)) {
        return {};
      }
      throw new ConfigStorageError();
    }

    try {
      const parsed = JSON.parse(source) as unknown;
      return isRecord(parsed) ? copyRecord(parsed) : {};
    } catch {
      return {};
    }
  }

  write(values: Readonly<Record<string, unknown>>): void {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    let serialized: string;
    try {
      serialized = `${JSON.stringify(copyRecord(values), null, 2)}\n`;
    } catch {
      throw new ConfigStorageError();
    }

    try {
      mkdirSync(directory, { mode: 0o700, recursive: true });
      writeFileSync(temporaryPath, serialized, {
        encoding: 'utf8',
        mode: 0o600,
      });
      renameSync(temporaryPath, this.filePath);
    } catch {
      throw new ConfigStorageError();
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function copyRecord(
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }

  return copy;
}
