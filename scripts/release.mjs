import { execFileSync } from 'node:child_process';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGithubRelease, createGithubDraft } from './lib/github-release.mjs';
import { verifiedReleaseBuild } from './lib/release-build.mjs';
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
const { tag } = validateReleaseVersion(metadata.version, pushedTag);
const output =
  process.env.RELEASE_ASSET_DIR ?? path.join(root, 'out', 'release');
const notesFile = path.join(path.dirname(output), 'inknote-release-notes.md');
const command = process.argv[2];

function run(executable, args, input = undefined) {
  return execFileSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
  }).trim();
}

async function manifest(repository, releaseMetadata = metadata) {
  const assets = await writeChecksums(output, releaseMetadata);
  await writeFile(notesFile, renderReleaseNotes(releaseMetadata, repository));
  return [...assets, await describeAsset(path.join(output, 'SHA256SUMS'))];
}

// GitHub CLI receives its token from the Actions job, never from source or arguments.
// https://cli.github.com/manual/gh_release_create
async function publish() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    !['workflow_run', 'workflow_dispatch'].includes(
      process.env.GITHUB_EVENT_NAME,
    ) ||
    !process.env.RELEASE_BUILD_RUN_ID ||
    !repository
  )
    throw new Error(
      'Public releases must run in the tested tag workflow on GitHub Actions.',
    );
  const github = (args, input = undefined) => run('gh', args, input);
  const build = verifiedReleaseBuild(
    repository,
    process.env.RELEASE_BUILD_RUN_ID,
    github,
  );
  const { metadata: releaseMetadata, tag, prerelease } = build;
  const assets = await manifest(repository, releaseMetadata);
  const draftId = process.env.RELEASE_DRAFT_ID?.trim();
  if (draftId && !/^\d+$/.test(draftId))
    throw new Error('Invalid recovery draft ID.');
  let release = draftId
    ? JSON.parse(github(['api', `repos/${repository}/releases/${draftId}`]))
    : findGithubRelease(repository, tag, github);
  if (release && release.tag_name !== tag)
    throw new Error('The recovery draft belongs to another tag.');
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
  if (object.type !== 'commit' || object.sha !== build.commit)
    throw new Error(
      'The remote tag changed after the tested commit was checked out.',
    );

  if (!release)
    release = createGithubDraft(
      repository,
      { ...releaseMetadata, ...build },
      await readFile(notesFile, 'utf8'),
      github,
    );
  else
    github(
      [
        'api',
        '--method',
        'PATCH',
        `repos/${repository}/releases/${release.id}`,
        '--input',
        '-',
      ],
      JSON.stringify({
        name: `${releaseMetadata.productName} ${tag}`,
        body: await readFile(notesFile, 'utf8'),
      }),
    );
  assertDraftRelease(release);
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
  release = JSON.parse(
    run('gh', ['api', `repos/${repository}/releases/${release.id}`]),
  );
  assertDraftRelease(release);
  validateUploadedAssets(assets, release.assets);
  const published = JSON.parse(
    github(
      [
        'api',
        '--method',
        'PATCH',
        `repos/${repository}/releases/${release.id}`,
        '--input',
        '-',
      ],
      JSON.stringify({
        draft: false,
        prerelease,
        make_latest: prerelease ? 'false' : 'true',
      }),
    ),
  );
  if (published.draft || published.tag_name !== tag)
    throw new Error('GitHub did not publish the expected release.');
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
  case 'verify-build': {
    const build = verifiedReleaseBuild(
      process.env.GITHUB_REPOSITORY,
      process.env.RELEASE_BUILD_RUN_ID,
      (args) => run('gh', args),
    );
    console.log(
      JSON.stringify({
        tag: build.tag,
        commit: build.commit,
        checked: 'version and all four native installers',
      }),
    );
    break;
  }
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
    throw new Error(
      'Expected check, stage, manifest, verify-build, publish or tag.',
    );
}
