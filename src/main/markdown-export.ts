import { markdownLanguage } from '@codemirror/lang-markdown';
import { mkdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Note } from '../domain/note';
import {
  orderNotebooks,
  type SqliteLibraryTransfer,
} from '../infrastructure/sqlite/sqlite-library-transfer';
import { managedImageUrlPattern } from '../shared/images';
import {
  makeUniqueDirectory,
  readAvailableImage,
  writeAtomic,
} from './transfer-files';

export function exportName(
  title: string,
  fallback = 'Nota sin título',
): string {
  const cleaned = title
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
    .trim()
    .replace(/^\.+|[. ]+$/g, '');
  const name =
    Array.from(cleaned)
      .slice(0, 52)
      .join('')
      .replace(/[. ]+$/g, '') || fallback;
  return /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:[. ]|$)/i.test(
    name,
  )
    ? `_${name}`
    : name;
}

export function managedAttachments(body: string) {
  const attachments: {
    from: number;
    to: number;
    url: string;
    autolink: boolean;
  }[] = [];
  markdownLanguage.parser.parse(body).iterate({
    enter(node) {
      if (node.name !== 'URL') return;
      const parent = node.node.parent;
      if (
        !parent ||
        !['Image', 'Link', 'LinkReference', 'Autolink'].includes(parent.name)
      )
        return;
      const autolink = parent.name === 'Autolink';
      const raw = body.slice(node.from, node.to);
      const url =
        raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
      if (!managedImageUrlPattern.test(url)) return;
      attachments.push({
        from: autolink ? parent.from : node.from,
        to: autolink ? parent.to : node.to,
        url,
        autolink,
      });
    },
  });
  return attachments;
}

export function attachmentName(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}

export async function exportMarkdown(
  note: Note,
  file: string,
  imageSource: string,
): Promise<number> {
  const parent = path.dirname(file);
  let assets: string | undefined;
  try {
    const { body, missingAttachments } = await rewriteAttachments(
      note.body,
      async (name) => {
        const bytes = await readAvailableImage(imageSource, name);
        if (!bytes) return;
        assets ??= await makeUniqueDirectory(
          parent,
          `${exportName(path.parse(file).name)}.assets`,
        );
        const target = path.join(assets, name);
        await writeAtomic(target, bytes);
        return relativeUrl(parent, target);
      },
    );
    await writeAtomic(file, body);
    return missingAttachments;
  } catch (error) {
    if (assets) await rm(assets, { recursive: true, force: true });
    throw error;
  }
}

export async function exportLibraryMarkdown(
  library: SqliteLibraryTransfer,
  parent: string,
  imageSource: string,
) {
  const root = await makeUniqueDirectory(
    await realpath(parent),
    'InkNote Markdown',
  );
  const folders = new Map<string | null, string>([[null, root]]);
  const usedNames = new Map<string, Set<string>>();
  const written = new Set<string>();
  const missing = new Set<string>();
  const assets = path.join(root, 'Attachments');
  usedNames.set(root, new Set(['attachments']));
  try {
    for (const book of orderNotebooks(library.listNotebooks())) {
      const directory = folders.get(book.parentId)!;
      const child = path.join(
        directory,
        reserveName(
          directory,
          exportName(book.name, 'Notebook'),
          '',
          usedNames,
        ),
      );
      await mkdir(child, { mode: 0o700 });
      folders.set(book.id, child);
    }
    let notes = 0;
    for (const { id, trashed } of library.listVersions()) {
      if (trashed) continue;
      const note = library.readNote(id);
      if (!note || note.deletedAt !== null) continue;
      const directory = folders.get(note.metadata?.notebookId ?? null) ?? root;
      const file = reserveName(
        directory,
        exportName(note.title),
        '.md',
        usedNames,
      );
      const { body } = await rewriteAttachments(note.body, async (name) => {
        if (missing.has(name)) return;
        const target = path.join(assets, name);
        if (!written.has(name)) {
          const bytes = await readAvailableImage(imageSource, name);
          if (!bytes) {
            missing.add(name);
            return;
          }
          if (!written.size) await mkdir(assets, { mode: 0o700 });
          await writeAtomic(target, bytes);
          written.add(name);
        }
        return relativeUrl(directory, target);
      });
      await writeAtomic(path.join(directory, file), body);
      notes++;
    }
    if (notes) return { path: root, notes, missingAttachments: missing.size };
    await rm(root, { recursive: true });
    return null;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function rewriteAttachments(
  body: string,
  exportAttachment: (name: string) => Promise<string | undefined>,
) {
  const pieces: string[] = [];
  const paths = new Map<string, string | undefined>();
  let position = 0;
  for (const { from, to, url, autolink } of managedAttachments(body)) {
    if (!paths.has(url))
      paths.set(url, await exportAttachment(attachmentName(url)));
    const relative = paths.get(url);
    if (!relative) continue;
    pieces.push(
      body.slice(position, from),
      autolink ? `[Adjunto](${relative})` : relative,
    );
    position = to;
  }
  pieces.push(body.slice(position));
  return {
    body: pieces.join(''),
    missingAttachments: [...paths.values()].filter((value) => !value).length,
  };
}

function relativeUrl(directory: string, file: string): string {
  return path
    .relative(directory, file)
    .split(path.sep)
    .map(encodeURIComponent)
    .join('/');
}

function reserveName(
  directory: string,
  stem: string,
  ext: string,
  used: Map<string, Set<string>>,
): string {
  const names = used.get(directory) ?? new Set<string>();
  let name = stem + ext;
  for (let index = 2; names.has(name.toLowerCase()); index++)
    name = `${stem} (${index})${ext}`;
  names.add(name.toLowerCase());
  used.set(directory, names);
  return name;
}
