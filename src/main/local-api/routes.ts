import {
  listNotesInputSchema,
  noteIdInputSchema,
  searchNotesInputSchema,
  type NoteProjection,
  type Result,
} from '../../shared/ipc';
import {
  defaultNoteMetadata,
  noteStatusSchema,
} from '../../shared/note-metadata';
import { maxNoteTags, tagNameSchema } from '../../shared/tags';
import { z } from '../../shared/validation';
import type { NotesBackend } from './notes-backend';

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body?: unknown;
}
export interface ApiResponse {
  status: number;
  body: unknown;
}

const noteFields = {
  title: z.string(),
  body: z.string(),
  bookId: z.uuid().nullable(),
  tags: z.array(tagNameSchema).max(maxNoteTags),
  status: noteStatusSchema,
  pinned: z.boolean(),
};
export const createNoteSchema = z.object(noteFields).partial().strict();
export const patchNoteSchema = z
  .object({ ...noteFields, revision: z.number().int().positive() })
  .partial()
  .strict();

export const toApiNote = (note: NoteProjection) => {
  const metadata = note.metadata ?? defaultNoteMetadata;
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    bookId: metadata.notebookId,
    tags: metadata.tags,
    status: metadata.status,
    pinned: note.isPinned,
    trashed: note.deletedAt !== null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    revision: note.revision,
  };
};

const reply = (status: number, body: unknown): ApiResponse => ({
  status,
  body,
});
const problem = (status: number, message: string) =>
  reply(status, { error: message });
const invalid = () => problem(400, 'Solicitud no válida.');
const failed = (code: string) =>
  code === 'invalid_input'
    ? invalid()
    : code === 'not_found'
      ? problem(404, 'La nota no existe.')
      : code === 'conflict'
        ? problem(409, 'La nota cambió. Vuelve a leerla antes de editarla.')
        : problem(503, 'La biblioteca no está disponible.');
const noteReply = (result: Result<NoteProjection>, status = 200) =>
  result.ok ? reply(status, toApiNote(result.data)) : failed(result.error.code);

function listInput(query: URLSearchParams) {
  const number = (name: string, fallback?: number) =>
    query.has(name) ? Number(query.get(name)) : fallback;
  const optional = (name: string) =>
    query.has(name) ? { [name]: query.get(name) } : {};
  return {
    limit: number('limit', 50),
    offset: number('skip', 0),
    ...(query.has('bookId') ? { notebookId: query.get('bookId') } : {}),
    ...optional('tag'),
    ...optional('status'),
    ...(query.get('trashed') === 'true' ? { trashed: true } : {}),
  };
}

async function listNotes(query: URLSearchParams, backend: NotesBackend) {
  const keyword = query.get('keyword')?.trim();
  if (keyword) {
    const input = searchNotesInputSchema.safeParse({
      ...listInput(query),
      query: keyword,
    });
    if (!input.success) return invalid();
    const found = await backend.search(input.data);
    return found.ok
      ? reply(200, found.data.map(toApiNote))
      : failed(found.error.code);
  }
  const input = listNotesInputSchema.safeParse(listInput(query));
  if (!input.success) return invalid();
  const notes = await backend.list(input.data);
  return notes.ok
    ? reply(200, notes.data.map(toApiNote))
    : failed(notes.error.code);
}

const knownBook = (backend: NotesBackend, id: string | null | undefined) =>
  !id || backend.books().some((book) => book.id === id);

async function createNote(body: unknown, backend: NotesBackend) {
  const input = createNoteSchema.safeParse(body);
  if (!input.success || !knownBook(backend, input.data.bookId))
    return invalid();
  const {
    title = '',
    body: text = '',
    bookId,
    tags,
    status,
    pinned,
  } = input.data;
  const created = await backend.create({
    title,
    body: text,
    metadata: {
      ...defaultNoteMetadata,
      notebookId: bookId ?? null,
      tags: tags ?? [],
      status: status ?? 'none',
    },
  });
  if (!created.ok || !pinned) return noteReply(created, 201);
  return noteReply(
    await backend.update({
      id: created.data.id,
      title,
      body: text,
      expectedRevision: created.data.revision,
      metadata: created.data.metadata,
      isPinned: true,
    }),
    201,
  );
}

async function patchNote(id: string, body: unknown, backend: NotesBackend) {
  const input = patchNoteSchema.safeParse(body);
  if (!input.success || !knownBook(backend, input.data.bookId))
    return invalid();
  const current = await backend.get(id);
  if (!current.ok) return failed(current.error.code);
  if (current.data.deletedAt) return failed('conflict');
  const patch = input.data;
  const metadata = current.data.metadata ?? defaultNoteMetadata;
  return noteReply(
    await backend.update({
      id,
      title: patch.title ?? current.data.title,
      body: patch.body ?? current.data.body,
      expectedRevision: patch.revision ?? current.data.revision,
      isPinned: patch.pinned ?? current.data.isPinned,
      metadata: {
        ...metadata,
        notebookId:
          patch.bookId === undefined ? metadata.notebookId : patch.bookId,
        tags: patch.tags ?? metadata.tags,
        status: patch.status ?? metadata.status,
      },
    }),
  );
}

export async function handleApiRequest(
  { method, path, query, body }: ApiRequest,
  backend: NotesBackend,
): Promise<ApiResponse> {
  const notAllowed = problem(405, 'Método no admitido.');
  if (path === '/notes') {
    if (method === 'GET') return listNotes(query, backend);
    if (method === 'POST') return createNote(body, backend);
    return notAllowed;
  }
  if (path === '/books')
    return method === 'GET'
      ? reply(
          200,
          backend.books().map(({ id, name, parentId, count }) => ({
            id,
            name,
            parentId,
            count,
          })),
        )
      : notAllowed;
  if (path === '/tags')
    return method === 'GET' ? reply(200, backend.tags()) : notAllowed;
  const match = /^\/notes\/([^/]+)$/.exec(path);
  if (!match) return problem(404, 'Ruta no encontrada.');
  const id = noteIdInputSchema.safeParse({ id: match[1] });
  if (!id.success) return invalid();
  if (method === 'GET') return noteReply(await backend.get(id.data.id));
  if (method === 'PATCH') return patchNote(id.data.id, body, backend);
  if (method === 'DELETE') return noteReply(await backend.trash(id.data.id));
  return notAllowed;
}
