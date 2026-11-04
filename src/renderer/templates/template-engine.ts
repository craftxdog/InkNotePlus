import { parseDocument } from 'yaml';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { z } from '../../shared/validation';
import {
  noteMetadataSchema,
  type NoteMetadata,
} from '../../shared/note-metadata';
import type { Notebook } from '../../shared/library';

const configurationSchema = z.object({
  title: z.string().max(512).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(32).optional(),
  notebook: z.string().max(100).optional(),
  status: z
    .enum(['none', 'active', 'onHold', 'onhold', 'completed', 'dropped'])
    .optional(),
});
export function readTemplate(source: string) {
  const frontmatter =
    /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(source);
  if (!frontmatter)
    return { body: source, config: configurationSchema.parse({}) };
  if (frontmatter[1].length > 50_000)
    throw new Error('La configuración de la plantilla es demasiado grande.');
  const document = parseDocument(frontmatter[1], {
    uniqueKeys: true,
    schema: 'core',
  });
  if (document.errors.length)
    throw new Error('El frontmatter YAML de la plantilla no es válido.');
  const values = document.toJS({ maxAliasCount: 0 });
  const config = configurationSchema.parse(
    values && typeof values === 'object' ? (values._template ?? {}) : {},
  );
  // Keep unrelated frontmatter (e.g. tags consumed by exporters), removing only
  // template instructions from the generated note.
  document.delete('_template');
  const remaining =
    values && typeof values === 'object'
      ? Object.keys(values).filter((key) => key !== '_template')
      : [];
  return {
    config,
    body:
      (remaining.length ? `---\n${String(document)}---\n` : '') +
      source.slice(frontmatter[0].length).replace(/^\r?\n/, ''),
  };
}

function formatDate(date: Date, format: string) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const parts: Record<string, string> = {
    Y: String(date.getFullYear()),
    y: pad(date.getFullYear() % 100),
    m: pad(date.getMonth() + 1),
    d: pad(date.getDate()),
    H: pad(date.getHours()),
    M: pad(date.getMinutes()),
    S: pad(date.getSeconds()),
    I: pad(date.getHours() % 12 || 12),
    A: date.toLocaleDateString('en-US', { weekday: 'long' }),
    a: date.toLocaleDateString('en-US', { weekday: 'short' }),
    B: date.toLocaleDateString('en-US', { month: 'long' }),
    b: date.toLocaleDateString('en-US', { month: 'short' }),
    p: date.getHours() < 12 ? 'AM' : 'PM',
    w: String(date.getDay()),
    u: String(date.getDay() || 7),
    F: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    T: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    '%': '%',
  };
  return format.replace(
    /%([a-zA-Z%])/g,
    (original, key: string) => parts[key] ?? original,
  );
}
export function renderTemplateValues(
  value: string,
  now = new Date(),
  uuid: () => string = () => crypto.randomUUID(),
) {
  return value
    .replace(
      /\{\{\s*(['"])now\1\s*\|\s*date:\s*(['"])(.*?)\2\s*\}\}/g,
      (_match, _quote, _formatQuote, format: string) => formatDate(now, format),
    )
    .replace(/\{%\s*uuid\s*%\}/g, () => uuid());
}
export function stripTemplateInstructions(body: string) {
  const ranges: { from: number; to: number }[] = [];
  markdownLanguage.parser.parse(body).iterate({
    enter(node) {
      if (
        node.name === 'Blockquote' &&
        /^\s*>\s*#{1,6}\s+!/.test(body.slice(node.from, node.to))
      ) {
        ranges.push({ from: node.from, to: node.to });
        return false;
      }
    },
  });
  for (const range of ranges.toReversed())
    body = body.slice(0, range.from) + body.slice(range.to);
  return body.replace(/^\s*\n/, '');
}
export function applyTemplate(
  source: { title: string; body: string; metadata?: NoteMetadata },
  current: NoteMetadata,
  books: readonly Notebook[],
  now = new Date(),
) {
  const { body, config } = readTemplate(source.body);
  let notebookId = current.notebookId;
  if (config.notebook) {
    const matches = books.filter(
      (book) =>
        book.id === config.notebook ||
        book.name.toLocaleLowerCase() === config.notebook!.toLocaleLowerCase(),
    );
    if (matches.length !== 1)
      throw new Error(
        'El notebook de la plantilla no existe o su nombre es ambiguo.',
      );
    notebookId = matches[0].id;
  }
  const templateStatus =
    config.status === 'onHold'
      ? 'onhold'
      : (config.status ?? source.metadata?.status ?? 'none');
  const metadata = noteMetadataSchema.parse({
    ...current,
    notebookId,
    isTemplate: false,
    status: current.status === 'none' ? templateStatus : current.status,
    tags: [
      ...new Set([
        ...current.tags,
        ...(source.metadata?.tags ?? []),
        ...(config.tags ?? []),
      ]),
    ],
  });
  return {
    title: renderTemplateValues(config.title ?? source.title, now),
    body: renderTemplateValues(stripTemplateInstructions(body), now),
    metadata,
  };
}
