import { EditorView } from '@codemirror/view';
import type { InkNoteApi } from '../../preload/api';
import {
  resolveShortcutCommand,
  type ShortcutCommand,
} from '../../shared/keybindings';
import type { NoteProjection, Result } from '../../shared/ipc';
import {
  defaultNoteMetadata,
  noteStatusSchema,
} from '../../shared/note-metadata';
import { tagNameSchema } from '../../shared/tags';
import { z } from '../../shared/validation';
import { executeShortcut } from '../shortcuts';
import type { WorkspaceStoreApi } from '../state/workspace-store';

const statusToInkdrop = { onhold: 'onHold' } as Record<string, string>;
const statusFromInkdrop = z.preprocess(
  (value) => (value === 'onHold' ? 'onhold' : value),
  noteStatusSchema,
);
const noteId = z
  .string()
  .transform((value) => value.replace(/^note:/, ''))
  .pipe(z.uuid());
const bookId = z
  .string()
  .transform((value) => value.replace(/^book:/, ''))
  .pipe(z.uuid());
const noteDoc = z.object({
  _id: noteId.optional(),
  _rev: z.string().regex(/^\d+/).optional(),
  title: z.string().max(512).default(''),
  body: z.string().max(1_000_000).default(''),
  bookId: bookId.nullable().optional(),
  tags: z.array(tagNameSchema).max(50).optional(),
  status: statusFromInkdrop.optional(),
  pinned: z.boolean().optional(),
});
// These commands manage plugins or the app itself, so a plugin cannot run them.
const blockedCommands = new Set<ShortcutCommand>([
  'application:open-preferences',
  'window:reload',
]);

const toDoc = (note: NoteProjection) => {
  const metadata = note.metadata ?? defaultNoteMetadata;
  return {
    _id: `note:${note.id}`,
    _rev: String(note.revision),
    doctype: 'markdown',
    title: note.title,
    body: note.body,
    bookId: metadata.notebookId ? `book:${metadata.notebookId}` : null,
    tags: metadata.tags,
    status: statusToInkdrop[metadata.status] ?? metadata.status,
    pinned: note.isPinned,
    createdAt: Date.parse(note.createdAt),
    updatedAt: Date.parse(note.updatedAt),
  };
};
function unwrap<T>(result: Result<T>) {
  if (!result.ok) throw new Error(`InkNote respondió: ${result.error.code}`);
  return result.data;
}
const activeView = () => {
  const element = document.querySelector<HTMLElement>('.cm-editor');
  const view = element && EditorView.findFromDOM(element);
  if (!view) throw new Error('No hay ninguna nota abierta en el editor.');
  return view;
};

export function createPluginBroker(options: {
  store: WorkspaceStoreApi;
  api: Pick<InkNoteApi, 'notes' | 'library'>;
  plugin: string;
}) {
  const { api, store } = options;
  async function read(id: string) {
    const [note] = unwrap(await api.notes.list({ id, limit: 1 }));
    if (!note) throw new Error('La nota no existe.');
    return note;
  }
  const methods: Record<string, (params: unknown) => unknown> = {
    async 'notes.get'(params) {
      const { id } = z.object({ id: noteId }).parse(params);
      return toDoc(await read(id));
    },
    async 'notes.all'(params) {
      const { limit, skip } = z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          skip: z.number().int().min(0).default(0),
        })
        .parse(params);
      return unwrap(await api.notes.list({ limit, offset: skip })).map(toDoc);
    },
    async 'notes.put'(params) {
      const { doc } = z.object({ doc: noteDoc }).parse(params);
      if (!doc._id) {
        const created = unwrap(
          await api.notes.create({
            title: doc.title,
            body: doc.body,
            metadata: {
              ...defaultNoteMetadata,
              notebookId: doc.bookId ?? null,
              tags: doc.tags ?? [],
              status: doc.status ?? 'none',
            },
          }),
        );
        return toDoc(created);
      }
      const current = await read(doc._id);
      const metadata = current.metadata ?? defaultNoteMetadata;
      return toDoc(
        unwrap(
          await api.notes.update({
            id: doc._id,
            title: doc.title,
            body: doc.body,
            // Parsing the revision keeps a stale plugin from overwriting edits.
            expectedRevision: doc._rev
              ? Number.parseInt(doc._rev, 10)
              : current.revision,
            isPinned: doc.pinned ?? current.isPinned,
            metadata: {
              ...metadata,
              notebookId:
                doc.bookId === undefined ? metadata.notebookId : doc.bookId,
              tags: doc.tags ?? metadata.tags,
              status: doc.status ?? metadata.status,
            },
          }),
        ),
      );
    },
    'books.all': () =>
      store.getState().library.notebooks.map(({ id, name, parentId }) => ({
        _id: `book:${id}`,
        name,
        parentBookId: parentId ? `book:${parentId}` : null,
      })),
    'tags.all': () =>
      store.getState().library.tags.map(({ name, color }) => ({ name, color })),
    'notifications.add'(params) {
      const notice = z
        .object({
          level: z.enum(['info', 'success', 'warning', 'error']),
          message: z.string().max(500),
          detail: z.string().max(1000).optional(),
        })
        .parse(params);
      store.getState().addPluginNotice({ ...notice, plugin: options.plugin });
      return true;
    },
    'commands.dispatch'(params) {
      const { name } = z.object({ name: z.string().max(120) }).parse(params);
      const command = resolveShortcutCommand(name);
      if (!command || blockedCommands.has(command))
        throw new Error(`Comando no permitido: ${name}`);
      return executeShortcut(store, command, document.activeElement);
    },
    'editor.getValue': () => activeView().state.doc.toString(),
    'editor.getSelection'() {
      const { state } = activeView();
      const { from, to } = state.selection.main;
      return state.sliceDoc(from, to);
    },
    'editor.replaceSelection'(params) {
      const { text } = z
        .object({ text: z.string().max(1_000_000) })
        .parse(params);
      const view = activeView();
      view.dispatch(view.state.replaceSelection(text));
      return true;
    },
  };
  return async (method: string, params: unknown) => {
    if (!Object.hasOwn(methods, method))
      throw new Error(`Método no permitido: ${method}`);
    return methods[method](params);
  };
}
