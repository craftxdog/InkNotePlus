import { validateReleaseVersion, releaseAssets } from './release.mjs';

const requiredChecks = [
  'Verify release version',
  'macOS Apple Silicon DMG',
  'macOS Intel DMG',
  'Windows x64 Setup',
  'Linux x64 DEB and RPM',
];

// Only artifacts from this repository's completed tag builds may reach a release.
// https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run
export function verifiedReleaseBuild(repository, runId, execute) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !/^\d+$/.test(runId)
  )
    throw new Error('Invalid release build identity.');
  const api = (endpoint, args = []) =>
    JSON.parse(execute(['api', `repos/${repository}/${endpoint}`, ...args]));
  const run = api(`actions/runs/${runId}`);
  if (
    run.status !== 'completed' ||
    run.event !== 'push' ||
    run.head_repository?.full_name !== repository ||
    run.path?.split('@')[0] !== '.github/workflows/installers.yml' ||
    !/^v\d+\.\d+\.\d+/.test(run.head_branch) ||
    !/^[a-f0-9]{40}$/.test(run.head_sha)
  )
    throw new Error(
      'Expected a completed native tag build from this repository.',
    );
  const pages = api(`actions/runs/${runId}/jobs?filter=latest&per_page=100`, [
    '--paginate',
    '--slurp',
  ]);
  const jobs = pages.flatMap((page) => page.jobs);
  if (
    !requiredChecks.every((name) =>
      jobs.some(
        (job) =>
          job.name === name &&
          job.status === 'completed' &&
          job.conclusion === 'success',
      ),
    )
  )
    throw new Error(
      'All native installer and version checks must pass before publication.',
    );
  const source = api(`contents/package.json?ref=${run.head_sha}`);
  const metadata = JSON.parse(
    Buffer.from(source.content, 'base64').toString('utf8'),
  );
  const version = validateReleaseVersion(metadata.version, run.head_branch);
  releaseAssets(metadata);
  let object = api(`git/ref/tags/${version.tag}`).object;
  for (let depth = 0; object.type === 'tag' && depth < 5; depth++)
    object = api(`git/tags/${object.sha}`).object;
  if (object.type !== 'commit' || object.sha !== run.head_sha)
    throw new Error('The release tag no longer matches its tested build.');
  return { metadata, ...version, commit: run.head_sha };
}
