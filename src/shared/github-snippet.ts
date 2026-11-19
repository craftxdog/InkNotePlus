import { z } from './validation';
import { appErrorSchema } from './ipc';

export const GITHUB_CHANNELS = {
  snippet: 'github:snippet',
  status: 'github:status',
  setToken: 'github:set-token',
  clearToken: 'github:clear-token',
} as const;

export const githubSnippetResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), markdown: z.string() }).strict(),
  z
    .object({
      status: z.enum([
        'invalid_url',
        'not_found',
        'unauthorized',
        'too_large',
        'failed',
      ]),
    })
    .strict(),
]);
export type GithubSnippetResponse = z.output<
  typeof githubSnippetResponseSchema
>;
export const githubUrlSchema = z.string().trim().min(1).max(2048);
export const githubTokenSchema = z.string().trim().min(1).max(512);
const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }).strict(),
    z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
  ]);
export const githubSnippetResultSchema = result(githubSnippetResponseSchema);
export const githubStatusResultSchema = result(z.boolean());

export interface GithubLocation {
  owner: string;
  repo: string;
  ref: string;
  path: string;
  start: number | null;
  end: number | null;
}

const namePattern = /^[\w.-]+$/;

export function parseGithubUrl(value: string): GithubLocation | null {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
  const [owner, repo, kind, ref, ...parts] = url.pathname
    .split('/')
    .slice(1)
    .map(decodeURIComponent);
  if (
    kind !== 'blob' ||
    !ref ||
    !parts.length ||
    ![owner, repo, ref].every((part) => namePattern.test(part)) ||
    parts.some((part) => !part || part === '.' || part === '..')
  )
    return null;
  const lines = /^#L(\d+)(?:-L(\d+))?$/.exec(url.hash);
  if (url.hash && !lines) return null;
  const start = lines ? Number(lines[1]) : null;
  const end = lines ? Number(lines[2] ?? lines[1]) : null;
  if (start !== null && (start < 1 || end! < start)) return null;
  return { owner, repo, ref, path: parts.join('/'), start, end };
}

export function formatGithubSnippet(
  location: GithubLocation,
  source: string,
  content: string,
) {
  const lines = content.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const code = (
    location.start === null
      ? lines
      : lines.slice(location.start - 1, location.end!)
  ).join('\n');
  const longest = Math.max(
    2,
    ...[...code.matchAll(/`+/g)].map(([run]) => run.length),
  );
  const fence = '`'.repeat(longest + 1);
  const name = location.path.split('/').at(-1) ?? '';
  const language = name.includes('.') ? name.split('.').at(-1) : '';
  const attributes = [
    `title="${location.path.replace(/["\\]/g, '\\$&')}"`,
    ...(location.start === null ? [] : [`line=${location.start}`]),
    `url="${source.replace(/["\\]/g, '\\$&')}"`,
  ].join(' ');
  return `${fence}${language} ${attributes}\n${code}\n${fence}\n`;
}
