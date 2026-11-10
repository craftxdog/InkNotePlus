import { isolateHistory } from '@codemirror/commands';
import { matchBrackets, syntaxTree } from '@codemirror/language';
import {
  EditorSelection,
  type EditorState,
  type Line,
} from '@codemirror/state';
import { EditorView, type Command } from '@codemirror/view';

function lineGroups(state: EditorState, join = false) {
  const { doc } = state;
  const groups: { first: Line; last: Line }[] = [];
  for (const range of state.selection.ranges) {
    const first = doc.lineAt(range.from);
    const last =
      range.empty && join
        ? doc.line(Math.min(doc.lines, first.number + 1))
        : doc.lineAt(range.empty ? range.to : range.to - 1);
    const previous = groups.at(-1);
    if (previous && first.number <= previous.last.number) {
      if (last.number > previous.last.number) previous.last = last;
    } else groups.push({ first, last });
  }
  return groups;
}

export function sortLines(
  descending: boolean,
  caseSensitive: boolean,
): Command {
  const collator = new Intl.Collator(undefined, {
    sensitivity: caseSensitive ? 'variant' : 'accent',
  });
  return (view) => {
    const { state } = view;
    if (state.readOnly) return false;
    const changes = lineGroups(state).flatMap(({ first, last }) => {
      if (first.number === last.number) return [];
      const text = state.sliceDoc(first.from, last.to);
      const insert = text
        .split('\n')
        .sort((a, b) => (descending ? -1 : 1) * collator.compare(a, b))
        .join('\n');
      return insert === text ? [] : [{ from: first.from, to: last.to, insert }];
    });
    if (changes.length)
      view.dispatch({
        changes,
        selection: state.selection,
        annotations: isolateHistory.of('full'),
        userEvent: 'input.sort',
      });
    return !!changes.length;
  };
}

export const joinLines: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const edits = lineGroups(state, true).flatMap(({ first, last }) => {
    if (first.number === last.number) return [];
    const text = state.sliceDoc(first.from, last.to);
    return Array.from(
      text.matchAll(/[ \t]*\n(?:[ \t]*\n)*[ \t]*/g),
      (match) => ({
        from: first.from + match.index,
        to: first.from + match.index + match[0].length,
        insert: ' ',
      }),
    );
  });
  if (edits.length)
    view.dispatch({
      changes: edits,
      annotations: isolateHistory.of('full'),
      userEvent: 'input.join',
    });
  return !!edits.length;
};

export const insertLineBefore: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const groups = lineGroups(state);
  let added = 0;
  const cursors = groups.map(({ first }) => {
    const indent = /^[ \t]*/.exec(first.text)?.[0] ?? '';
    const cursor = EditorSelection.cursor(first.from + added + indent.length);
    added += indent.length + 1;
    return { cursor, change: { from: first.from, insert: `${indent}\n` } };
  });
  view.dispatch({
    changes: cursors.map(({ change }) => change),
    selection: EditorSelection.create(cursors.map(({ cursor }) => cursor)),
    scrollIntoView: true,
    annotations: isolateHistory.of('full'),
    userEvent: 'input',
  });
  return true;
};

export function changeCase(upper: boolean): Command {
  return (view) => {
    const { state } = view;
    if (state.readOnly) return false;
    const processed = new Set<number>();
    const transaction = state.changeByRange((range) => {
      const target = range.empty ? state.wordAt(range.head) : range;
      if (!target || processed.has(target.from)) return { range };
      processed.add(target.from);
      const text = state.sliceDoc(target.from, target.to);
      const insert = upper
        ? text.toLocaleUpperCase()
        : text.toLocaleLowerCase();
      if (insert === text) return { range };
      const to = target.from + insert.length;
      return {
        changes: { from: target.from, to: target.to, insert },
        range: range.empty
          ? EditorSelection.cursor(Math.min(range.head, to))
          : range.anchor <= range.head
            ? EditorSelection.range(target.from, to)
            : EditorSelection.range(to, target.from),
      };
    });
    if (transaction.changes.empty) return false;
    view.dispatch(transaction, {
      annotations: isolateHistory.of('full'),
      userEvent: 'input.case',
    });
    return true;
  };
}

export function findUnder(backward = false, skip = false): Command {
  return (view) => {
    const { state } = view;
    const { main, ranges, mainIndex } = state.selection;
    const target = main.empty ? state.wordAt(main.head) : main;
    if (!target) return false;
    const text = state.doc.toString();
    const match = state.sliceDoc(target.from, target.to);
    let index = backward
      ? target.from >= match.length
        ? text.lastIndexOf(match, target.from - match.length)
        : -1
      : text.indexOf(match, target.to);
    if (index < 0)
      index = backward ? text.lastIndexOf(match) : text.indexOf(match);
    if (index < 0 || (index === target.from && !main.empty)) return false;
    const range = EditorSelection.range(index, index + match.length);
    const selection = skip
      ? EditorSelection.create(
          ranges.map((old, i) => (i === mainIndex ? range : old)),
          mainIndex,
        )
      : range;
    view.dispatch({
      selection,
      scrollIntoView: true,
      userEvent: 'select.search',
    });
    return true;
  };
}

export const splitSelectionByLine: Command = (view) => {
  const { state } = view;
  const groups = lineGroups(state);
  const cursors = groups.flatMap(({ first, last }) => {
    const ranges = [];
    for (let n = first.number; n <= last.number; n++)
      ranges.push(EditorSelection.cursor(state.doc.line(n).to));
    return ranges;
  });
  if (cursors.length < 2) return false;
  view.dispatch({
    selection: EditorSelection.create(cursors, cursors.length - 1),
    userEvent: 'select',
  });
  return true;
};

export function scrollOneLine(direction: -1 | 1): Command {
  return (view) => {
    view.scrollDOM.scrollTop += view.defaultLineHeight * direction;
    return true;
  };
}

export const centerCursor: Command = (view) => {
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main.head, {
      y: 'center',
    }),
  });
  return true;
};

export const selectMatchingBracket: Command = (view) => {
  const { state } = view;
  const { anchor, head } = state.selection.main;
  const match = matchBrackets(state, head, 1) ?? matchBrackets(state, head, -1);
  if (!match?.matched || !match.end) return false;
  view.dispatch({
    selection: {
      anchor,
      head: match.end.from < head ? match.end.from : match.end.to,
    },
    scrollIntoView: true,
    userEvent: 'select',
  });
  return true;
};

export function linkAtCursor(view: EditorView) {
  const { state } = view;
  const tree = syntaxTree(state);
  const head = state.selection.main.head;
  for (
    let node: ReturnType<typeof tree.resolve> | null = tree.resolve(head, -1);
    node;
    node = node.parent
  ) {
    if (node.name === 'URL') return state.sliceDoc(node.from, node.to);
    const url =
      node.name === 'Link' || node.name === 'Autolink'
        ? node.getChild('URL')
        : null;
    if (url) return state.sliceDoc(url.from, url.to);
  }
  return null;
}
