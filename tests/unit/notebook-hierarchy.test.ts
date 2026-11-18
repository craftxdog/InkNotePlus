import { describe, expect, it } from 'vitest';
import type { Notebook } from '../../src/shared/library';
import {
  notebookTree,
  filterNotebookTree,
  notebookDropTarget,
  notebookStepTarget,
  notebookSubtreeIds,
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

describe('notebook drop targets', () => {
  const list = [
    book('a', 'A', null),
    book('b', 'B', null),
    book('c', 'C', null),
    book('a1', 'A1', 'a'),
    book('a2', 'A2', 'a'),
  ];
  it('places a notebook before, after or inside the target', () => {
    expect(notebookDropTarget(list, 'c', 'a', 'before')).toEqual({
      parentId: null,
      beforeId: 'a',
    });
    expect(notebookDropTarget(list, 'a', 'b', 'after')).toEqual({
      parentId: null,
      beforeId: 'c',
    });
    expect(notebookDropTarget(list, 'a', 'c', 'after')).toEqual({
      parentId: null,
      beforeId: null,
    });
    expect(notebookDropTarget(list, 'c', 'a', 'inside')).toEqual({
      parentId: 'a',
      beforeId: null,
    });
    expect(notebookDropTarget(list, 'a1', 'b', 'before')).toEqual({
      parentId: null,
      beforeId: 'b',
    });
  });
  it('rejects cycles and drops that change nothing', () => {
    expect(notebookDropTarget(list, 'a', 'a', 'inside')).toBeNull();
    expect(notebookDropTarget(list, 'a', 'a1', 'inside')).toBeNull();
    expect(notebookDropTarget(list, 'a', 'b', 'before')).toBeNull();
    expect(notebookDropTarget(list, 'b', 'a', 'after')).toBeNull();
    expect(notebookDropTarget(list, 'a2', 'a', 'inside')).toBeNull();
    expect(notebookDropTarget(list, 'missing', 'a', 'inside')).toBeNull();
  });
  it('moves one step among siblings and stops at the edges', () => {
    expect(notebookStepTarget(list, 'b', -1)).toEqual({
      parentId: null,
      beforeId: 'a',
    });
    expect(notebookStepTarget(list, 'b', 1)).toEqual({
      parentId: null,
      beforeId: null,
    });
    expect(notebookStepTarget(list, 'a', 1)).toEqual({
      parentId: null,
      beforeId: 'c',
    });
    expect(notebookStepTarget(list, 'a', -1)).toBeNull();
    expect(notebookStepTarget(list, 'c', 1)).toBeNull();
  });
  it('collects a subtree even with a malformed cycle', () => {
    expect([...notebookSubtreeIds(list, 'a')].sort()).toEqual([
      'a',
      'a1',
      'a2',
    ]);
    const cyclic = [book('x', 'X', 'y'), book('y', 'Y', 'x')];
    expect(notebookSubtreeIds(cyclic, 'x').size).toBe(2);
  });
});
