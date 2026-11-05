import { expect, it } from 'vitest';
import { verifiedReleaseBuild } from '../../scripts/lib/release-build.mjs';
import { createGithubDraft } from '../../scripts/lib/github-release.mjs';

const repository = 'craftxdog/InkNotePlus';
const sha = 'b'.repeat(40);
const metadata = { productName: 'InkNote', version: '1.0.1' };
const nativeNames = [
  'macOS Apple Silicon DMG',
  'macOS Intel DMG',
  'Windows x64 Setup',
  'Linux x64 DEB and RPM',
];
const run = {
  status: 'completed',
  event: 'push',
  head_branch: 'v1.0.1',
  head_sha: sha,
  head_repository: { full_name: repository },
  path: '.github/workflows/installers.yml',
};
const jobs = ['Verify release version', ...nativeNames].map((name) => ({
  name,
  conclusion: 'success',
  status: 'completed',
}));

function executor(
  overrides: { run?: object; jobs?: typeof jobs; tagSha?: string } = {},
) {
  return (args: string[]) => {
    const endpoint = args[1];
    if (endpoint.endsWith('/runs/123'))
      return JSON.stringify({ ...run, ...overrides.run });
    if (endpoint.includes('/runs/123/jobs'))
      return JSON.stringify([{ jobs: overrides.jobs ?? jobs }]);
    if (endpoint.includes('/contents/package.json'))
      return JSON.stringify({
        content: Buffer.from(JSON.stringify(metadata)).toString('base64'),
      });
    if (endpoint.includes('/git/ref/tags/'))
      return JSON.stringify({
        object: { type: 'commit', sha: overrides.tagSha ?? sha },
      });
    throw new Error(`Unexpected API endpoint: ${endpoint}`);
  };
}

it('reuses a completed tagged build only when every native installer and version check passed', () => {
  expect(verifiedReleaseBuild(repository, '123', executor())).toMatchObject({
    metadata,
    tag: 'v1.0.1',
    commit: sha,
    prerelease: false,
  });
});

it('rejects incomplete, foreign, non-tagged and moved-tag builds', () => {
  for (const override of [
    { status: 'in_progress' },
    { event: 'pull_request' },
    { head_branch: 'main' },
    { head_repository: { full_name: 'someone/fork' } },
  ])
    expect(() =>
      verifiedReleaseBuild(repository, '123', executor({ run: override })),
    ).toThrow();
  expect(() =>
    verifiedReleaseBuild(repository, '../123', executor()),
  ).toThrow();
  expect(() =>
    verifiedReleaseBuild(
      repository,
      '123',
      executor({ tagSha: 'c'.repeat(40) }),
    ),
  ).toThrow(/tag/i);
  expect(() =>
    verifiedReleaseBuild(repository, '123', executor({ jobs: jobs.slice(1) })),
  ).toThrow(/checks/i);
  expect(() =>
    verifiedReleaseBuild(
      repository,
      '123',
      executor({
        jobs: jobs.map((job) =>
          job.name === nativeNames[0] ? { ...job, conclusion: 'failure' } : job,
        ),
      }),
    ),
  ).toThrow(/checks/i);
});

it('captures the numeric draft ID directly from creation instead of rediscovering a hidden draft', () => {
  const draft = { id: 1234, tag_name: 'v1.0.1', draft: true, assets: [] };
  const created = createGithubDraft(
    repository,
    { ...metadata, tag: 'v1.0.1', commit: sha, prerelease: false },
    'notes',
    (args: string[], input: string) => {
      expect(args).toContain('POST');
      expect(args).toContain('--input');
      expect(JSON.parse(input)).toMatchObject({
        tag_name: 'v1.0.1',
        draft: true,
        target_commitish: sha,
      });
      return JSON.stringify(draft);
    },
  );
  expect(created).toEqual(draft);
});
