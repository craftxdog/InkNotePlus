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
import { openAsBlob } from 'node:fs';

// Stream the file-backed Blob; installers never need to be loaded into RAM.
// https://nodejs.org/api/fs.html#fsopenasblobpath-options
// https://docs.github.com/en/rest/releases/assets#upload-a-release-asset
export async function uploadGithubAsset(
  repository,
  releaseId,
  filename,
  asset,
  token,
  request = fetch,
) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isSafeInteger(releaseId) ||
    releaseId <= 0 ||
    !token
  )
    throw new Error('Invalid release upload identity.');
  const type =
    asset.name === 'SHA256SUMS' ? 'text/plain' : 'application/octet-stream';
  const body = await openAsBlob(filename, { type });
  if (body.size !== asset.size)
    throw new Error(`Release file changed before upload: ${asset.name}`);
  const url = new URL(
    `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets`,
  );
  url.searchParams.set('name', asset.name);
  const response = await request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      'Content-Type': type,
      'Content-Length': String(asset.size),
    },
    body,
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok)
    throw new Error(`GitHub upload failed (${response.status}): ${asset.name}`);
  return response.json();
}
