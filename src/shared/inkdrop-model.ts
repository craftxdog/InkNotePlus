import type { NoteStatus } from './note-metadata';
import { z } from './validation';

// Inkdrop's documented documents, read only at the import boundary. InkNote
// keeps its own model internally.
// https://developers.inkdrop.app/data-access/notes
const noteDocument = z.looseObject({
  _id: z.string().startsWith('note:'),
  title: z.string().default(''),
  body: z.string().default(''),
  bookId: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  status: z.string().optional(),
  pinned: z.boolean().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});
const bookDocument = z.looseObject({
  _id: z.string().startsWith('book:'),
  name: z.string(),
  parentBookId: z.string().nullable().optional(),
});
const tagDocument = z.looseObject({
  _id: z.string().startsWith('tag:'),
  name: z.string(),
});
const fileDocument = z.looseObject({
  _id: z.string().startsWith('file:'),
  contentType: z.string().default(''),
  _attachments: z.looseObject({
    index: z.looseObject({ data: z.string() }),
  }),
});

export type InkdropDocument =
  | { kind: 'note'; doc: z.output<typeof noteDocument> }
  | { kind: 'book'; doc: z.output<typeof bookDocument> }
  | { kind: 'tag'; doc: z.output<typeof tagDocument> }
  | { kind: 'file'; doc: z.output<typeof fileDocument> };

export function parseInkdropDocument(value: unknown): InkdropDocument | null {
  const note = noteDocument.safeParse(value);
  if (note.success) return { kind: 'note', doc: note.data };
  const book = bookDocument.safeParse(value);
  if (book.success) return { kind: 'book', doc: book.data };
  const tag = tagDocument.safeParse(value);
  if (tag.success) return { kind: 'tag', doc: tag.data };
  const file = fileDocument.safeParse(value);
  return file.success ? { kind: 'file', doc: file.data } : null;
}

const statuses: Readonly<Record<string, NoteStatus>> = {
  none: 'none',
  active: 'active',
  onHold: 'onhold',
  completed: 'completed',
  dropped: 'dropped',
};

export const fromInkdropStatus = (status: string | undefined): NoteStatus =>
  (status !== undefined && Object.hasOwn(statuses, status)
    ? statuses[status]
    : undefined) ?? 'none';

export function fromInkdropTimestamp(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function rewriteInkdropLinks(
  body: string,
  notes: ReadonlyMap<string, string>,
  files: ReadonlyMap<string, string>,
) {
  return body
    .replace(/inkdrop:\/\/note[:/]([\w-]+)/g, (link, id: string) => {
      const target = notes.get(`note:${id}`);
      return target ? `inknote://note/${target}` : link;
    })
    .replace(
      /inkdrop:\/\/file:([\w-]+)/g,
      (link, id: string) => files.get(`file:${id}`) ?? link,
    );
}
