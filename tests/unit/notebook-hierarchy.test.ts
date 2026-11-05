import { expect, it } from 'vitest';
import type { Notebook } from '../../src/shared/library';
import {
  notebookTree,
  filterNotebookTree,
} from '../../src/renderer/notebooks/notebook-hierarchy';

const book = (id: string, name: string, parentId: string | null): Notebook => ({
  id,
  name,
  parentId,
  icon: 'book-open',
  count: 0,
  descendantCount: 0,
});
const books = [
  book('commands', 'Comandos', 'linux'),
  book('inbox', 'Inbox', null),
  book('linux', 'Linux', null),
  book('projects', 'Proyectos', 'work'),
  book('research', 'Investigación', 'projects'),
  book('work', 'Trabajo', null),
];

it('groups children under their parents and retains the complete path', () => {
  expect(
    notebookTree(books).map(({ notebook, depth, path }) => [
      notebook.id,
      depth,
      path.join(' / '),
    ]),
  ).toEqual([
    ['inbox', 0, 'Inbox'],
    ['linux', 0, 'Linux'],
    ['commands', 1, 'Linux / Comandos'],
    ['work', 0, 'Trabajo'],
    ['projects', 1, 'Trabajo / Proyectos'],
    ['research', 2, 'Trabajo / Proyectos / Investigación'],
  ]);
});

it('keeps ancestors as context when searching names, paths and accents', () => {
  const entries = notebookTree(books);
  expect(
    filterNotebookTree(entries, 'investigacion').map((e) => e.notebook.id),
  ).toEqual(['work', 'projects', 'research']);
  expect(
    filterNotebookTree(entries, 'linux comandos').map((e) => e.notebook.id),
  ).toEqual(['linux', 'commands']);
  expect(filterNotebookTree(entries, 'missing')).toEqual([]);
  expect(filterNotebookTree(entries, '   ')).toEqual(entries);
});

it('limits a scoped tree to its children and stops malformed cycles', () => {
  expect(notebookTree(books, 'work').map((e) => e.notebook.id)).toEqual([
    'projects',
    'research',
  ]);
  const cyclic = [book('a', 'A', 'b'), book('b', 'B', 'a')];
  expect(notebookTree(cyclic, 'a').map((e) => e.notebook.id)).toEqual(['b']);
});
