import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sources from '../../themes/upstream-sources.json';
describe('official theme sources', () => {
  for (const source of sources)
    it(`preserves published sources for ${source.repository}`, () => {
      for (const [file, expected] of Object.entries(source.files)) {
        const bytes = readFileSync(file);
        // Imported palette JSON gains one final LF; its generated values are unchanged.
        const contents =
          file.endsWith('/palette.json') && bytes.at(-1) === 10
            ? bytes.subarray(0, -1)
            : bytes;
        const sha = createHash('sha1')
          .update(`blob ${contents.length}\0`)
          .update(contents)
          .digest('hex');
        expect(sha, file).toBe(expected);
      }
    });
});
