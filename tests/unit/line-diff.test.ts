import { expect, it } from 'vitest';
import { diffLines } from '../../src/renderer/editor/line-diff';

const compact = (before: string, after: string) =>
  diffLines(before, after).map(({ type, text }) => `${type[0]}:${text}`);

it('marks kept, removed and added lines in order', () => {
  expect(compact('a\nb\nc', 'a\nx\nc\nd')).toEqual([
    's:a',
    'r:b',
    'a:x',
    's:c',
    'a:d',
  ]);
});
it('reports identical text as unchanged', () => {
  expect(compact('a\nb', 'a\nb')).toEqual(['s:a', 's:b']);
});
it('handles empty sides', () => {
  expect(compact('', 'a')).toEqual(['r:', 'a:a']);
  expect(compact('a', '')).toEqual(['r:a', 'a:']);
});
it('stays fast on very large rewrites', () => {
  const before = Array.from({ length: 6000 }, (_, i) => `a${i}`).join('\n');
  const after = Array.from({ length: 6000 }, (_, i) => `b${i}`).join('\n');
  const started = performance.now();
  const lines = diffLines(before, after);
  expect(lines).toHaveLength(12000);
  expect(performance.now() - started).toBeLessThan(1000);
});
