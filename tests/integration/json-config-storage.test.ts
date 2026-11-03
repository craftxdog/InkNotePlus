import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { JsonConfigStorage } from '../../src/infrastructure/config/json-config-storage';

describe('JsonConfigStorage', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('persists namespaced configuration as JSON without a prior file', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'inknote-config-'));
    directories.push(directory);
    const filePath = path.join(directory, 'config.json');
    const storage = new JsonConfigStorage(filePath);

    expect(storage.read()).toEqual({});

    storage.write({
      'core.window.minimumHeight': 480,
      'core.window.minimumWidth': 640,
    });

    expect(storage.read()).toEqual({
      'core.window.minimumHeight': 480,
      'core.window.minimumWidth': 640,
    });
    expect(readFileSync(filePath, 'utf8')).toContain(
      '"core.window.minimumWidth": 640',
    );
  });

  it('treats malformed or non-object files as empty configuration', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'inknote-config-'));
    directories.push(directory);
    const filePath = path.join(directory, 'config.json');
    writeFileSync(filePath, '["not", "a", "config"]', 'utf8');

    expect(new JsonConfigStorage(filePath).read()).toEqual({});
  });
});
