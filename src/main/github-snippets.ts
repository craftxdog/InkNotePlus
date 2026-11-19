import {
  formatGithubSnippet,
  parseGithubUrl,
  type GithubSnippetResponse,
} from '../shared/github-snippet';

const maxBytes = 1024 * 1024;
const maxLines = 500;

export async function fetchGithubSnippet(
  url: string,
  token: string | null,
  fetcher: typeof fetch = fetch,
): Promise<GithubSnippetResponse> {
  const location = parseGithubUrl(url);
  if (!location) return { status: 'invalid_url' };
  const path = location.path.split('/').map(encodeURIComponent).join('/');
  try {
    const response = await fetcher(
      `https://api.github.com/repos/${location.owner}/${location.repo}/contents/${path}?ref=${encodeURIComponent(location.ref)}`,
      {
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: {
          accept: 'application/vnd.github.raw+json',
          'user-agent': 'InkNote',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (response.status === 404) return { status: 'not_found' };
    if (response.status === 401 || response.status === 403)
      return { status: 'unauthorized' };
    if (!response.ok) return { status: 'failed' };
    const content = await response.text();
    if (content.length > maxBytes) return { status: 'too_large' };
    const markdown = formatGithubSnippet(location, url, content);
    return markdown.split('\n').length > maxLines + 3
      ? { status: 'too_large' }
      : { status: 'ok', markdown };
  } catch {
    return { status: 'failed' };
  }
}
