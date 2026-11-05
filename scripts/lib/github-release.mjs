// Discover existing releases by list and resolve their numeric ID.
// Newly created drafts use the creation response, since discovery may lag.
// https://docs.github.com/en/rest/releases/releases#list-releases
export function findGithubRelease(repository, tag, execute) {
  const id = execute([
    'api',
    `repos/${repository}/releases?per_page=100`,
    '--paginate',
    '--jq',
    `.[] | select(.tag_name == ${JSON.stringify(tag)}) | .id`,
  ]).trim();
  if (!id) return null;
  if (!/^\d+$/.test(id))
    throw new Error('Expected a unique release ID for this tag.');
  return JSON.parse(execute(['api', `repos/${repository}/releases/${id}`]));
}

export function createGithubDraft(repository, release, notes, execute) {
  const response = JSON.parse(
    execute(
      [
        'api',
        '--method',
        'POST',
        `repos/${repository}/releases`,
        '--input',
        '-',
      ],
      JSON.stringify({
        tag_name: release.tag,
        target_commitish: release.commit,
        name: `${release.productName} ${release.tag}`,
        body: notes,
        draft: true,
        prerelease: release.prerelease,
      }),
    ),
  );
  if (
    !Number.isSafeInteger(response.id) ||
    response.id <= 0 ||
    response.tag_name !== release.tag ||
    !response.draft
  )
    throw new Error('GitHub did not return the expected draft release ID.');
  return response;
}
