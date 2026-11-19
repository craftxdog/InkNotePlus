import { describe, expect, it, vi } from 'vitest';
import {
  formatGithubSnippet,
  parseGithubUrl,
} from '../../src/shared/github-snippet';
import { fetchGithubSnippet } from '../../src/main/github-snippets';

const url = 'https://github.com/acme/app/blob/main/src/index.ts#L2-L3';

describe('parseGithubUrl', () => {
  it('reads repository, ref, path and lines', () => {
    expect(parseGithubUrl(url)).toEqual({
      owner: 'acme',
      repo: 'app',
      ref: 'main',
      path: 'src/index.ts',
      start: 2,
      end: 3,
    });
  });
  it('accepts a single line and a whole file', () => {
    expect(parseGithubUrl(`${url.split('#')[0]}#L7`)).toMatchObject({
      start: 7,
      end: 7,
    });
    expect(parseGithubUrl(url.split('#')[0])).toMatchObject({
      start: null,
      end: null,
    });
  });
  it.each([
    'https://evil.example/acme/app/blob/main/a.ts',
    'http://github.com/acme/app/blob/main/a.ts',
    'https://github.com/acme/app/tree/main/src',
    'https://github.com/acme/app/blob/main/a.ts#L9-L2',
    'https://github.com/acme/app/blob/main/../../x',
    'nada',
  ])('rejects %s', (value) => expect(parseGithubUrl(value)).toBeNull());
});

describe('formatGithubSnippet', () => {
  it('builds a fenced block with its source', () => {
    expect(
      formatGithubSnippet(parseGithubUrl(url)!, url, 'uno\ndos\ntres\ncuatro'),
    ).toBe(
      `\`\`\`ts title="src/index.ts" line=2 url="${url}"\ndos\ntres\n\`\`\`\n`,
    );
  });
  it('uses a longer fence when the code contains backticks', () => {
    const block = formatGithubSnippet(
      parseGithubUrl(url.split('#')[0])!,
      url,
      '```\ncódigo\n```',
    );
    expect(block.startsWith('````ts')).toBe(true);
    expect(block.trimEnd().endsWith('\n````')).toBe(true);
  });
});

describe('fetchGithubSnippet', () => {
  const ok = () => new Response('uno\ndos\ntres');
  it('asks the GitHub API without a token by default', async () => {
    const fetcher = vi.fn(async () => ok());
    const result = await fetchGithubSnippet(url, null, fetcher as never);
    expect(result).toMatchObject({ status: 'ok' });
    const [target, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(target).toBe(
      'https://api.github.com/repos/acme/app/contents/src/index.ts?ref=main',
    );
    expect(init.redirect).toBe('error');
    expect(init.headers).not.toHaveProperty('authorization');
  });
  it('sends the token for private repositories', async () => {
    const fetcher = vi.fn(async () => ok());
    await fetchGithubSnippet(url, 'tok', fetcher as never);
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok' });
  });
  it.each([
    [404, 'not_found'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [500, 'failed'],
  ])('maps %i to %s', async (status, expected) => {
    const result = await fetchGithubSnippet(
      url,
      null,
      (async () => new Response('', { status })) as never,
    );
    expect(result).toEqual({ status: expected });
  });
  it('rejects a foreign link without any request', async () => {
    const fetcher = vi.fn();
    expect(
      await fetchGithubSnippet(
        'https://evil.example/x',
        'tok',
        fetcher as never,
      ),
    ).toEqual({ status: 'invalid_url' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refuses very large selections', async () => {
    const text = Array(600).fill('x').join('\n');
    const result = await fetchGithubSnippet(
      url.split('#')[0],
      null,
      (async () => new Response(text)) as never,
    );
    expect(result).toEqual({ status: 'too_large' });
  });
});
