// Draft releases are listed for authenticated writers but cannot be fetched by tag.
// Resolve their numeric ID first, then use the same endpoint before/after uploads.
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
