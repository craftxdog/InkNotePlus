import { expect, it } from 'vitest';
import { isExternalForNativeQa } from '../../scripts/qa-build.mjs';

it.each(['electron', 'node:fs/promises', 'react/jsx-runtime', '@scope/module'])(
  'leaves the package %s external in the native QA entry',
  (id) => expect(isExternalForNativeQa(id)).toBe(true),
);

it.each([
  './source.ts',
  '../source.ts',
  '/home/runner/project/src/database.ts',
  'D:/a/InkNotePlus/src/database.ts',
  String.raw`D:\a\InkNotePlus\src\database.ts`,
  String.raw`\\server\project\source.ts`,
  '\0virtual-entry',
])('bundles source module %s on every host platform', (id) =>
  expect(isExternalForNativeQa(id)).toBe(false),
);
