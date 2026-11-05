import { expect, it, vi } from 'vitest';
import { findGithubRelease } from '../../scripts/lib/github-release.mjs';

it('finds a draft through the release list and reads it by numeric ID', () => {
  const draft = { id: 435561362, tag_name: 'v1.0.0', draft: true, assets: [] };
  const execute = vi.fn((args: string[]) => {
    if (args[1].endsWith('/releases?per_page=100')) return '435561362\n';
    if (args[1].endsWith('/releases/435561362')) return JSON.stringify(draft);
    throw new Error(
      'Drafts are not available through releases/tags endpoints.',
    );
  });
  expect(findGithubRelease('craftxdog/InkNotePlus', 'v1.0.0', execute)).toEqual(
    draft,
  );
  expect(execute.mock.calls[0][0]).toContain('--paginate');
  expect(execute.mock.calls.flat(2).join(' ')).not.toContain('/releases/tags/');
});

it('returns null for a new version and refuses ambiguous draft IDs', () => {
  expect(
    findGithubRelease('craftxdog/InkNotePlus', 'v1.0.0', () => ''),
  ).toBeNull();
  expect(() =>
    findGithubRelease('craftxdog/InkNotePlus', 'v1.0.0', () => '12\n34'),
  ).toThrow(/unique/i);
});
