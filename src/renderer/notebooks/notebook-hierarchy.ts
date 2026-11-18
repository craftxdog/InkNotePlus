import type { Notebook } from '../../shared/library';

export interface NotebookEntry {
  notebook: Notebook;
  depth: number;
  path: string[];
  ancestors: string[];
}

export function notebookTree(
  books: readonly Notebook[],
  parentId: string | null = null,
): NotebookEntry[] {
  const children = new Map<string | null, Notebook[]>();
  for (const book of books) {
    const siblings = children.get(book.parentId) ?? [];
    siblings.push(book);
    children.set(book.parentId, siblings);
  }
  const entries: NotebookEntry[] = [];
  const seen = new Set(parentId ? [parentId] : []);
  const visit = (
    parent: string | null,
    path: string[],
    ancestors: string[],
  ) => {
    for (const notebook of children.get(parent) ?? []) {
      if (seen.has(notebook.id)) continue;
      seen.add(notebook.id);
      const nextPath = [...path, notebook.name];
      entries.push({
        notebook,
        depth: ancestors.length,
        path: nextPath,
        ancestors,
      });
      visit(notebook.id, nextPath, [...ancestors, notebook.id]);
    }
  };
  visit(parentId, [], []);
  return entries;
}

export type NotebookDropZone = 'before' | 'inside' | 'after';
export interface NotebookPlacement {
  parentId: string | null;
  beforeId: string | null;
}

export function notebookSubtreeIds(books: readonly Notebook[], id: string) {
  const ids = new Set([id]);
  for (const current of ids)
    for (const book of books) if (book.parentId === current) ids.add(book.id);
  return ids;
}

// Returns where a dropped notebook belongs, or null for a cycle or a no-op.
export function notebookDropTarget(
  books: readonly Notebook[],
  draggedId: string,
  targetId: string,
  zone: NotebookDropZone,
): NotebookPlacement | null {
  const dragged = books.find(({ id }) => id === draggedId);
  const target = books.find(({ id }) => id === targetId);
  if (!dragged || !target || notebookSubtreeIds(books, draggedId).has(targetId))
    return null;
  const parentId = zone === 'inside' ? target.id : target.parentId;
  const siblings = books.filter(
    (book) => book.parentId === parentId && book.id !== draggedId,
  );
  const beforeId =
    zone === 'inside'
      ? null
      : zone === 'before'
        ? target.id
        : (siblings[siblings.indexOf(target) + 1]?.id ?? null);
  const current = books.filter((book) => book.parentId === dragged.parentId);
  const following = current[current.indexOf(dragged) + 1]?.id ?? null;
  return dragged.parentId === parentId && following === beforeId
    ? null
    : { parentId, beforeId };
}

export function notebookStepTarget(
  books: readonly Notebook[],
  id: string,
  step: -1 | 1,
): NotebookPlacement | null {
  const book = books.find((value) => value.id === id);
  if (!book) return null;
  const siblings = books.filter(({ parentId }) => parentId === book.parentId);
  const index = siblings.indexOf(book);
  const next = index + step;
  if (next < 0 || next >= siblings.length) return null;
  return {
    parentId: book.parentId,
    beforeId: siblings[step < 0 ? next : next + 1]?.id ?? null,
  };
}

export function matchesNotebook(text: string, query: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase();
  const path = normalize(text);
  return normalize(query)
    .trim()
    .split(/\s+/u)
    .every((term) => path.includes(term));
}

export function filterNotebookTree(entries: NotebookEntry[], query: string) {
  if (!query.trim()) return entries;
  const visible = new Set<string>();
  for (const entry of entries) {
    if (!matchesNotebook(entry.path.join(' / '), query)) continue;
    visible.add(entry.notebook.id);
    for (const id of entry.ancestors) visible.add(id);
  }
  return entries.filter((entry) => visible.has(entry.notebook.id));
}
