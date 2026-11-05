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
