import { indentLess, indentMore, isolateHistory } from '@codemirror/commands';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { countColumn, type ChangeSpec, type Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

type MarkdownTree = ReturnType<typeof syntaxTree>;
type MarkdownNode = ReturnType<MarkdownTree['resolve']>;

function indentOf(text: string, maxQuotes = Infinity) {
  let from = 0;
  let quotes = 0;
  while (quotes < maxQuotes) {
    const quote = /^[ \t]*>[ \t]?/.exec(text.slice(from));
    if (!quote) break;
    from += quote[0].length;
    quotes++;
  }
  const to = from + (/^[ \t]*/.exec(text.slice(from))?.[0].length ?? 0);
  const quoteColumn = countColumn(text, 4, from);
  return {
    from,
    to,
    quotes,
    quoteColumn,
    width: countColumn(text, 4, to) - quoteColumn,
  };
}

function previousItem(item: MarkdownNode) {
  let sibling = item.prevSibling;
  while (sibling?.name === 'QuoteMark') sibling = sibling.prevSibling;
  if (sibling?.name === 'ListItem') return sibling;

  // Markdown parses a change of marker kind (e.g. 10. then -) as two lists.
  let list = item.parent?.prevSibling;
  while (list?.name === 'QuoteMark') list = list.prevSibling;
  if (list?.name !== 'BulletList' && list?.name !== 'OrderedList') return null;
  sibling = list.lastChild;
  while (sibling?.name === 'QuoteMark') sibling = sibling.prevSibling;
  return sibling?.name === 'ListItem' ? sibling : null;
}

function itemOnLine(tree: MarkdownTree, from: number, text: string) {
  const { to } = indentOf(text);
  if (to === text.length) return null;
  for (
    let node: MarkdownNode | null = tree.resolve(from + to, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return null;
    if (node.name === 'ListItem') return node;
  }
  return null;
}

function itemIndent(doc: Text, item: MarkdownNode) {
  const line = doc.lineAt(item.from);
  const indent = indentOf(line.text);
  const marker = item.getChild('ListMark');
  const end = (marker?.to ?? item.from) - line.from;
  const padding = /^[ \t]*/.exec(line.text.slice(end))?.[0].length ?? 0;
  const markerColumn = countColumn(line.text, 4, end);
  const gap = countColumn(line.text, 4, end + padding) - markerColumn;
  return {
    ...indent,
    childWidth:
      markerColumn - indent.quoteColumn + (gap >= 1 && gap <= 4 ? gap : 1),
  };
}

function shiftListItems(view: EditorView, outdent: boolean) {
  const { state } = view;
  const { doc, selection } = state;
  const tree =
    ensureSyntaxTree(state, doc.lineAt(selection.ranges.at(-1)!.to).to, 35) ??
    syntaxTree(state);
  const selected = new Map<number, MarkdownNode>();
  for (const { from, to, empty } of selection.ranges) {
    const last = doc.lineAt(empty ? to : to - 1).number;
    for (let n = doc.lineAt(from).number; n <= last; n++) {
      const line = doc.line(n);
      const item = itemOnLine(tree, line.from, line.text);
      if (item && (empty || item.from >= doc.lineAt(from).from))
        selected.set(item.from, item);
    }
  }
  if (!selected.size) return false;

  const changes: ChangeSpec[] = [];
  const targets = new Map<number, MarkdownNode | null>();
  let movedThrough = -1;
  for (const item of [...selected.values()].sort((a, b) => a.from - b.from)) {
    if (item.from < movedThrough) continue;
    movedThrough = item.to;
    const current = itemIndent(doc, item);
    let target = previousItem(item);
    if (outdent) {
      const parent = item.parent?.parent;
      target = parent?.name === 'ListItem' ? parent : null;
    } else if (target && targets.has(target.from)) {
      target = targets.get(target.from) ?? null;
    }
    targets.set(item.from, target);
    const parent = target && itemIndent(doc, target);
    if (parent && parent.quotes !== current.quotes) continue;
    const width = outdent ? (parent?.width ?? 0) : parent?.childWidth;
    if (width === undefined) continue;
    const delta = width - current.width;
    if (outdent ? delta >= 0 : delta <= 0) continue;

    const end = doc.lineAt(item.to - 1).number;
    for (let n = doc.lineAt(item.from).number; n <= end; n++) {
      const line = doc.line(n);
      const indent = indentOf(line.text, current.quotes);
      if (indent.to === line.length || indent.quotes < current.quotes) continue;
      const insert = ' '.repeat(Math.max(0, indent.width + delta));
      if (insert !== line.text.slice(indent.from, indent.to))
        changes.push({
          from: line.from + indent.from,
          to: line.from + indent.to,
          insert,
        });
    }
  }
  if (!changes.length) return true;
  const changeSet = state.changes(changes);
  view.dispatch({
    changes: changeSet,
    selection: selection.map(changeSet, 1),
    scrollIntoView: true,
    annotations: isolateHistory.of('full'),
    userEvent: outdent ? 'delete.dedent' : 'input.indent',
  });
  return true;
}

export function indentMarkdown(view: EditorView) {
  return (
    !view.state.readOnly && (shiftListItems(view, false) || indentMore(view))
  );
}

export function outdentMarkdown(view: EditorView) {
  return (
    !view.state.readOnly && (shiftListItems(view, true) || indentLess(view))
  );
}
