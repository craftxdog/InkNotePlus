import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fromHtml } from 'hast-util-from-html';
import { toMdast } from 'hast-util-to-mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import { SaxesParser } from 'saxes';
import { parse as parseYaml } from 'yaml';
import { maxBodyLength, maxTitleLength } from '../shared/ipc';
import type { ImportedNote } from '../shared/transfer';
import { readRegularFile } from './transfer-files';

const markdownFiles = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']);
const htmlFiles = new Set(['.html', '.htm']);
const maxTextFile = 20 * 1024 * 1024;
const maxEnexFile = 512 * 1024 * 1024;
const maxImage = 5_000_000;
const maxEntries = 20_000;
const maxDepth = 32;

interface HtmlNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
}
interface ImportOptions {
  storeImage: (bytes: Buffer) => Promise<string | null>;
}
interface ImportContext extends ImportOptions {
  cache: Map<string, string | null>;
  images: number;
  missingImages: number;
}

const isInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

// Notion appends a 32-character identifier to exported files and folders.
const cleanName = (name: string) =>
  name.replace(/\s+[0-9a-f]{32}$/i, '').trim() || name;

async function storeBytes(
  context: ImportContext,
  key: string,
  bytes: Buffer,
): Promise<string | null> {
  if (context.cache.has(key)) return context.cache.get(key)!;
  const url =
    bytes.length > maxImage
      ? null
      : await context.storeImage(bytes).catch(() => null);
  context.cache.set(key, url);
  if (url) context.images++;
  return url;
}

// Returns undefined for references that should stay as written (remote URLs),
// and null for local images that could not be imported.
async function importImage(
  context: ImportContext,
  reference: string,
  directory: string,
  root: string,
): Promise<string | null | undefined> {
  const data = /^data:image\/[a-z0-9+.-]+;base64,([a-z0-9+/=\s]+)$/i.exec(
    reference,
  );
  let url: string | null | undefined;
  if (data) {
    const bytes = Buffer.from(data[1], 'base64');
    url = await storeBytes(
      context,
      createHash('sha256').update(bytes).digest('hex'),
      bytes,
    );
  } else if (
    !reference ||
    reference.startsWith('#') ||
    reference.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/i.test(reference)
  )
    return undefined;
  else url = await readLocalImage(context, reference, directory, root);
  if (!url) context.missingImages++;
  return url;
}

async function readLocalImage(
  context: ImportContext,
  reference: string,
  directory: string,
  root: string,
) {
  try {
    const clean = reference.split(/[?#]/, 1)[0];
    const decoded = decodeURIComponent(clean);
    if (path.isAbsolute(decoded)) return null;
    const target = path.resolve(directory, decoded);
    if (!isInside(root, target)) return null;
    // A link inside the folder must not lead to a file outside of it.
    const [realRoot, realTarget] = await Promise.all([
      realpath(root),
      realpath(target),
    ]);
    if (!isInside(realRoot, realTarget)) return null;
    if (context.cache.has(realTarget)) return context.cache.get(realTarget)!;
    return await storeBytes(
      context,
      realTarget,
      await readRegularFile(realTarget, maxImage),
    );
  } catch {
    return null;
  }
}

async function replaceMarkdownImages(
  context: ImportContext,
  markdown: string,
  directory: string,
  root: string,
) {
  const images: { start: number; end: number; url: string }[] = [];
  const visit = (node: {
    type: string;
    url?: string;
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: never[];
  }) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (node.type === 'image' && node.url && start !== undefined && end)
      images.push({ start, end, url: node.url });
    (node.children ?? []).forEach(visit);
  };
  visit(fromMarkdown(markdown) as never);
  let result = markdown;
  for (const image of images.toReversed()) {
    const url = await importImage(context, image.url, directory, root);
    if (!url) continue;
    const alt = /^!\[([\s\S]*?)\]\(/.exec(
      markdown.slice(image.start, image.end),
    )?.[1];
    if (alt === undefined) continue;
    result = `${result.slice(0, image.start)}![${alt}](${url})${result.slice(image.end)}`;
  }
  return result;
}

const parseDate = (value: unknown) => {
  if (!(value instanceof Date) && typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

function finishNote(
  source: string,
  fallbackTitle: string,
  preferredTitle?: string,
) {
  let body = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let meta: Record<string, unknown> = {};
  const frontMatter = /^---\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(
    body,
  );
  if (frontMatter) {
    try {
      const parsed: unknown = parseYaml(frontMatter[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
        body = body.slice(frontMatter[0].length);
      }
    } catch {
      // Text that only resembles front matter stays in the note.
    }
  }
  const stated =
    (typeof meta.title === 'string' && meta.title.trim()) || preferredTitle;
  const heading = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/.exec(body);
  let title = stated || fallbackTitle;
  if (heading && (!stated || heading[1] === stated)) {
    title = heading[1];
    body = body.slice(heading[0].length).replace(/^\n+/, '');
  }
  const tags = Array.isArray(meta.tags)
    ? meta.tags.filter((tag): tag is string => typeof tag === 'string')
    : typeof meta.tags === 'string'
      ? meta.tags.split(',')
      : [];
  return {
    title: title.slice(0, maxTitleLength),
    body,
    tags,
    createdAt: parseDate(meta.created ?? meta.created_at ?? meta.date),
    updatedAt: parseDate(meta.updated ?? meta.updated_at ?? meta.modified),
  };
}

function htmlToMarkdown(tree: HtmlNode) {
  return toMarkdown(toMdast(tree as never), {
    bullet: '-',
    emphasis: '*',
    strong: '*',
    fence: '`',
    fences: true,
    rule: '-',
    listItemIndent: 'one',
    extensions: [gfmToMarkdown()],
  });
}

async function walkHtml(
  node: HtmlNode,
  visit: (element: HtmlNode, parent: HtmlNode) => Promise<void> | void,
) {
  // Visitors may replace or remove the current child.
  for (const child of (node.children ?? []).slice()) {
    if (child.type === 'element') await visit(child, node);
    await walkHtml(child, visit);
  }
}

async function readHtml(
  context: ImportContext,
  html: string,
  directory: string,
  root: string,
  fallbackTitle: string,
) {
  const tree = fromHtml(html) as HtmlNode;
  let pageTitle = '';
  await walkHtml(tree, async (element) => {
    if (element.tagName === 'title')
      pageTitle =
        element.children
          ?.map((child) => child.value ?? '')
          .join('')
          .trim() ?? '';
    const source = element.properties?.src;
    if (element.tagName !== 'img' || typeof source !== 'string') return;
    const url = await importImage(context, source, directory, root);
    if (url) element.properties!.src = url;
  });
  return finishNote(
    htmlToMarkdown(tree),
    fallbackTitle,
    pageTitle || undefined,
  );
}

interface EnexResource {
  data: string;
  mime: string;
}
interface EnexNote {
  title: string;
  content: string;
  created: string;
  updated: string;
  tags: string[];
  resources: EnexResource[];
}

function parseEnex(xml: string) {
  const notes: EnexNote[] = [];
  const parser = new SaxesParser();
  let note: EnexNote | null = null;
  let resource: EnexResource | null = null;
  let field = '';
  let text = '';
  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', ({ name }) => {
    if (name === 'note')
      note = {
        title: '',
        content: '',
        created: '',
        updated: '',
        tags: [],
        resources: [],
      };
    else if (name === 'resource') resource = { data: '', mime: '' };
    field = name;
    text = '';
  });
  parser.on('text', (value) => (text += value));
  parser.on('cdata', (value) => (text += value));
  parser.on('closetag', ({ name }) => {
    const current = note as EnexNote | null;
    const attachment = resource as EnexResource | null;
    if (name === 'note' && current) {
      notes.push(current);
      note = null;
    } else if (name === 'resource' && current && attachment) {
      current.resources.push(attachment);
      resource = null;
    } else if (field === name && attachment) {
      if (name === 'data') attachment.data = text;
      if (name === 'mime') attachment.mime = text.trim();
    } else if (field === name && current) {
      if (name === 'tag') current.tags.push(text.trim());
      else if (name === 'title') current.title = text.trim();
      else if (name === 'content') current.content = text;
      else if (name === 'created') current.created = text.trim();
      else if (name === 'updated') current.updated = text.trim();
    }
  });
  parser.write(xml).close();
  return notes;
}

const enexDate = (value: string) =>
  parseDate(
    value.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      '$1-$2-$3T$4:$5:$6Z',
    ),
  );

const todoMark = (checked: boolean) =>
  checked ? 'INKNOTETODODONE' : 'INKNOTETODOOPEN';

async function readEnexNote(context: ImportContext, note: EnexNote) {
  const resources = new Map(
    note.resources.map((resource) => {
      const bytes = Buffer.from(resource.data.replace(/\s+/g, ''), 'base64');
      return [
        createHash('md5').update(bytes).digest('hex'),
        { ...resource, bytes },
      ] as const;
    }),
  );
  // ENML self-closes these elements, which HTML parsing would otherwise nest.
  const markup = note.content.replace(
    /<(en-media|en-todo)\b([^>]*?)\/>/g,
    '<$1$2></$1>',
  );
  const tree = fromHtml(markup, { fragment: true }) as HtmlNode;
  await walkHtml(tree, async (element, parent) => {
    const siblings = parent.children!;
    const index = siblings.indexOf(element);
    if (element.tagName === 'en-todo') {
      const checked = String(element.properties?.checked) === 'true';
      siblings[index] = { type: 'text', value: todoMark(checked) };
    } else if (element.tagName === 'en-media') {
      const hash = String(element.properties?.hash ?? '');
      const resource = resources.get(hash);
      const url = resource?.mime.startsWith('image/')
        ? await storeBytes(context, `md5:${hash}`, resource.bytes)
        : null;
      if (url)
        siblings[index] = {
          type: 'element',
          tagName: 'img',
          properties: { src: url, alt: '' },
          children: [],
        };
      else {
        context.missingImages++;
        siblings.splice(index, 1);
      }
    }
  });
  const body = htmlToMarkdown(tree)
    .replace(
      /^([ \t]*)INKNOTETODO(DONE|OPEN)/gm,
      (_, indent, state) => `${indent}- [${state === 'DONE' ? 'x' : ' '}] `,
    )
    .replace(/INKNOTETODO(DONE|OPEN)/g, (_, state) =>
      state === 'DONE' ? '[x] ' : '[ ] ',
    )
    .replace(/(^- \[[ x]\] .*)\n\n(?=- \[[ x]\] )/gm, '$1\n');
  return {
    title: (note.title || 'Nota sin título').slice(0, maxTitleLength),
    body,
    tags: note.tags,
    createdAt: enexDate(note.created),
    updatedAt: enexDate(note.updated),
  };
}

export async function readImportSources(
  paths: readonly string[],
  options: ImportOptions,
) {
  const context: ImportContext = {
    ...options,
    cache: new Map(),
    images: 0,
    missingImages: 0,
  };
  const notes: ImportedNote[] = [];
  let skipped = 0;
  let entries = 0;
  const add = (note: Omit<ImportedNote, 'folders'>, folders: string[]) => {
    if (note.body.length > maxBodyLength) skipped++;
    else notes.push({ ...note, folders });
  };

  async function readFile(file: string, root: string, folders: string[]) {
    const extension = path.extname(file).toLowerCase();
    const directory = path.dirname(file);
    const name = cleanName(path.basename(file, path.extname(file)));
    if (extension === '.enex') {
      const xml = (await readRegularFile(file, maxEnexFile)).toString('utf8');
      for (const note of parseEnex(xml))
        add(await readEnexNote(context, note), [...folders, name]);
      return;
    }
    const text = (await readRegularFile(file, maxTextFile)).toString('utf8');
    const stat = await lstat(file);
    const dates = {
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
    };
    const note = htmlFiles.has(extension)
      ? await readHtml(context, text, directory, root, name)
      : finishNote(
          await replaceMarkdownImages(context, text, directory, root),
          name,
        );
    add(
      {
        ...note,
        createdAt: note.createdAt ?? dates.createdAt,
        updatedAt: note.updatedAt ?? dates.updatedAt,
      },
      folders,
    );
  }

  const isSupported = (file: string) => {
    const extension = path.extname(file).toLowerCase();
    return (
      markdownFiles.has(extension) ||
      htmlFiles.has(extension) ||
      extension === '.enex'
    );
  };

  async function readBundle(bundle: string, folders: string[]) {
    for (const name of ['text.md', 'text.markdown', 'text.txt']) {
      const file = path.join(bundle, name);
      const exists = await lstat(file).catch(() => null);
      if (!exists?.isFile()) continue;
      const fallback = cleanName(path.basename(bundle, '.textbundle'));
      const text = (await readRegularFile(file, maxTextFile)).toString('utf8');
      add(
        finishNote(
          await replaceMarkdownImages(context, text, bundle, bundle),
          fallback,
        ),
        folders,
      );
      return;
    }
    skipped++;
  }

  async function walk(
    directory: string,
    root: string,
    folders: string[],
    depth: number,
  ) {
    if (depth > maxDepth) return;
    const items = await readdir(directory, { withFileTypes: true });
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      if (item.name.startsWith('.') || item.isSymbolicLink()) continue;
      if (++entries > maxEntries) return;
      const target = path.join(directory, item.name);
      if (item.isDirectory()) {
        if (item.name.toLowerCase().endsWith('.textbundle'))
          await readBundle(target, folders).catch(() => skipped++);
        else
          await walk(
            target,
            root,
            [...folders, cleanName(item.name)],
            depth + 1,
          ).catch(() => skipped++);
      } else if (item.isFile() && isSupported(target))
        await readFile(target, root, folders).catch(() => skipped++);
    }
  }

  for (const selected of paths) {
    try {
      const stat = await lstat(selected);
      if (stat.isDirectory()) {
        if (selected.toLowerCase().endsWith('.textbundle'))
          await readBundle(selected, []);
        else
          await walk(
            selected,
            selected,
            [cleanName(path.basename(selected))],
            0,
          );
      } else if (stat.isFile() && isSupported(selected))
        await readFile(selected, path.dirname(selected), []);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return {
    notes,
    images: context.images,
    missingImages: context.missingImages,
    skipped,
  };
}
