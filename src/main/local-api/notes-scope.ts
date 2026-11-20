import {
  failure,
  success,
  type ListNotesInput,
  type NoteProjection,
  type Result,
} from '../../shared/ipc';
import {
  defaultNoteMetadata,
  type NoteMetadata,
} from '../../shared/note-metadata';
import type { LocalApiScope } from '../../shared/preferences';
import type { NotesBackend } from './notes-backend';

// Limits everything the local API and MCP can reach to one notebook (with its
// sub-notebooks) or one tag. Notes outside the scope behave as missing, new
// notes are created inside it, and edits cannot move a note out of it.
export function scopeNotesBackend(
  backend: NotesBackend,
  current: () => LocalApiScope,
): NotesBackend {
  async function subtree(rootId: string) {
    const books = await backend.books();
    if (!books.some((book) => book.id === rootId)) return new Set<string>();
    const ids = new Set([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const book of books)
        if (book.parentId && ids.has(book.parentId) && !ids.has(book.id)) {
          ids.add(book.id);
          grew = true;
        }
    }
    return ids;
  }
  const fits = async (scope: LocalApiScope, metadata: NoteMetadata) =>
    scope.type === 'all' ||
    (scope.type === 'notebook'
      ? !!metadata.notebookId &&
        (await subtree(scope.notebookId)).has(metadata.notebookId)
      : metadata.tags.includes(scope.tag));
  const visible = (note: NoteProjection) =>
    fits(current(), note.metadata ?? defaultNoteMetadata);
  // Filters run in the query, so limits and offsets stay correct.
  async function restrict<T extends ListNotesInput>(input: T) {
    const scope = current();
    if (scope.type === 'all') return input;
    if (scope.type === 'tag')
      return { ...input, tags: [...(input.tags ?? []), scope.tag] };
    if (!(await subtree(scope.notebookId)).size) return null;
    return { ...input, scopeId: scope.notebookId };
  }
  async function everyVisibleNote() {
    const notes: NoteProjection[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await scoped.list({ limit: 100, offset });
      if (!page.ok) return notes;
      notes.push(...page.data);
      if (page.data.length < 100) return notes;
    }
  }
  async function getVisible(id: string): Promise<Result<NoteProjection>> {
    const found = await backend.get(id);
    return found.ok && !(await visible(found.data))
      ? failure('not_found')
      : found;
  }

  const scoped: NotesBackend = {
    async list(input) {
      const limited = await restrict(input);
      return limited ? backend.list(limited) : success([]);
    },
    async search(input) {
      const limited = await restrict(input);
      return limited ? backend.search(limited) : success([]);
    },
    get: getVisible,
    async create(input) {
      const scope = current();
      const metadata = input.metadata ?? defaultNoteMetadata;
      const placed: NoteMetadata =
        scope.type === 'notebook' && metadata.notebookId === null
          ? { ...metadata, notebookId: scope.notebookId }
          : scope.type === 'tag' && !metadata.tags.includes(scope.tag)
            ? { ...metadata, tags: [...metadata.tags, scope.tag] }
            : metadata;
      if (!(await fits(scope, placed))) return failure('invalid_input');
      return backend.create({ ...input, metadata: placed });
    },
    async update(input) {
      const found = await getVisible(input.id);
      if (!found.ok) return found;
      if (input.metadata && !(await fits(current(), input.metadata)))
        return failure('invalid_input');
      return backend.update(input);
    },
    async trash(id) {
      const found = await getVisible(id);
      return found.ok ? backend.trash(id) : found;
    },
    async books() {
      const scope = current();
      const books = await backend.books();
      if (scope.type === 'all') return books;
      if (scope.type === 'notebook') {
        const ids = await subtree(scope.notebookId);
        return books.filter((book) => ids.has(book.id));
      }
      // Counts cover tagged notes only, so untagged notes stay unseen.
      const counts = new Map<string, number>();
      for (const note of await everyVisibleNote()) {
        const id = note.metadata?.notebookId;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return books.flatMap((book) =>
        counts.has(book.id) ? [{ ...book, count: counts.get(book.id)! }] : [],
      );
    },
    async tags() {
      const tags = await backend.tags();
      if (current().type === 'all') return tags;
      const used = new Set(
        (await everyVisibleNote()).flatMap((note) => note.metadata?.tags ?? []),
      );
      return tags.filter((tag) => used.has(tag.name));
    },
  };
  return scoped;
}
