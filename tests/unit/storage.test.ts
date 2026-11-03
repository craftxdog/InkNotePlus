import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  configFileName,
  databaseFileName,
  getConfigPath,
  getDatabasePath,
} from '../../src/main/storage';

describe('local storage path', () => {
  it('uses a new, versioned database without touching legacy data', () => {
    expect(databaseFileName).toBe('inknote-v2.sqlite');
    expect(getDatabasePath('/tmp/InkNote')).toBe(
      path.join('/tmp/InkNote', 'inknote-v2.sqlite'),
    );
  });
});

it('stores configuration beside the versioned local database', () => {
  expect(configFileName).toBe('config.json');
  expect(getConfigPath('/tmp/InkNote')).toBe(
    path.join('/tmp/InkNote', 'config.json'),
  );
});
