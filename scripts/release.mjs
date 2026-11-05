import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateReleaseVersion,
  stageInstallers,
  writeChecksums,
  describeAsset,
  assertDraftRelease,
  validateUploadedAssets,
  renderReleaseNotes,
} from './lib/release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const pushedTag = process.env.GITHUB_REF?.startsWith('refs/tags/')
  ? process.env.GITHUB_REF_NAME
  : '';
const { tag, prerelease } = validateReleaseVersion(metadata.version, pushedTag);
const output = path.join(root, 'out', 'release');
const notesFile = path.join(root, 'out', 'release-notes.md');
const command = process.argv[2];

function run(executable, args) {
  return execFileSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

async function manifest(repository) {
  const assets = await writeChecksums(output, metadata);
  await writeFile(notesFile, renderReleaseNotes(metadata, repository));
  return [...assets, await describeAsset(path.join(output, 'SHA256SUMS'))];
}

// GitHub CLI receives its token from the Actions job, never from source or arguments.
// https://cli.github.com/manual/gh_release_create
async function publish() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_EVENT_NAME !== 'push' ||
    !pushedTag ||
    !repository
  )
    throw new Error(
      'Public releases must run in the tested tag workflow on GitHub Actions.',
    );
  const assets = await manifest(repository);
  const endpoint = `repos/${repository}/releases/tags/${tag}`;
  const probe = spawnSync('gh', ['api', endpoint], {
    cwd: root,
    encoding: 'utf8',
  });
  let release;
  if (probe.error) throw probe.error;
  if (probe.status === 0) release = JSON.parse(probe.stdout);
  else if (!/\(HTTP 404\)/.test(probe.stderr))
    throw new Error(`Cannot inspect release: ${probe.stderr}`);
  assertDraftRelease(release);

  // A tag moved while the builders were running must not publish their old bytes.
  const ref = JSON.parse(
    run('gh', ['api', `repos/${repository}/git/ref/tags/${tag}`]),
  );
  let object = ref.object;
  for (let depth = 0; object.type === 'tag' && depth < 5; depth++)
    object = JSON.parse(
      run('gh', ['api', `repos/${repository}/git/tags/${object.sha}`]),
    ).object;
  if (
    object.type !== 'commit' ||
    object.sha !== run('git', ['rev-parse', 'HEAD'])
  )
    throw new Error(
      'The remote tag changed after the tested commit was checked out.',
    );

  if (!release)
    run('gh', [
      'release',
      'create',
      tag,
      '--repo',
      repository,
      '--verify-tag',
      '--draft',
      '--title',
      `${metadata.productName} ${tag}`,
      '--notes-file',
      notesFile,
      ...(prerelease ? ['--prerelease'] : []),
    ]);
  else
    run('gh', [
      'release',
      'edit',
      tag,
      '--repo',
      repository,
      '--title',
      `${metadata.productName} ${tag}`,
      '--notes-file',
      notesFile,
    ]);
  // Replacing partially uploaded files is allowed only while the release remains a draft.
  run('gh', [
    'release',
    'upload',
    tag,
    '--repo',
    repository,
    '--clobber',
    ...assets.map((asset) => path.join(output, asset.name)),
  ]);
  release = JSON.parse(run('gh', ['api', endpoint]));
  assertDraftRelease(release);
  validateUploadedAssets(assets, release.assets);
  run('gh', [
    'release',
    'edit',
    tag,
    '--repo',
    repository,
    '--draft=false',
    `--prerelease=${prerelease}`,
    `--latest=${!prerelease}`,
  ]);
  const url = `https://github.com/${repository}/releases/tag/${tag}`;
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Release publicada: [${tag}](${url})\n`,
    );
  console.log(url);
}

switch (command) {
  case 'check':
    console.log(
      `Release version checked: ${tag}${pushedTag ? ' (pushed tag)' : ' (build only)'}`,
    );
    break;
  case 'stage':
    await stageInstallers(
      path.join(root, 'out', 'make'),
      output,
      metadata,
      process.argv[3],
      process.argv[4],
    );
    break;
  case 'manifest':
    await manifest(process.env.GITHUB_REPOSITORY ?? 'craftxdog/InkNotePlus');
    break;
  case 'publish':
    await publish();
    break;
  case 'tag': {
    if (run('git', ['status', '--porcelain']))
      throw new Error('Commit all changes before creating a release tag.');
    if (run('git', ['branch', '--show-current']) !== 'main')
      throw new Error(
        'Create release tags from main after merging the tested changes.',
      );
    if (
      run('git', ['rev-parse', 'HEAD']) !==
      run('git', ['rev-parse', 'origin/main'])
    )
      throw new Error(
        'Update main from origin before creating the release tag.',
      );
    run('git', [
      'tag',
      '--annotate',
      tag,
      '--message',
      `${metadata.productName} ${tag}`,
    ]);
    console.log(`Tag creado: ${tag}\nPublicar: git push origin ${tag}`);
    break;
  }
  default:
    throw new Error('Expected check, stage, manifest, publish or tag.');
}
