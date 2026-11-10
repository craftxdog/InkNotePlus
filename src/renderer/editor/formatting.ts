import { isolateHistory } from '@codemirror/commands';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, type ChangeSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'heading'
  | 'heading-1'
  | 'heading-3'
  | 'heading-4'
  | 'heading-bigger'
  | 'heading-smaller'
  | 'quote'
  | 'code'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'link'
  | 'rule';

const inlineFormats = {
  bold: { node: 'StrongEmphasis', mark: '**', placeholder: 'texto' },
  italic: { node: 'Emphasis', mark: '*', placeholder: 'texto' },
  strike: { node: 'Strikethrough', mark: '~~', placeholder: 'texto' },
  code: { node: 'InlineCode', mark: '`', placeholder: 'código' },
} as const;

function toggleInline(
  view: EditorView,
  format: (typeof inlineFormats)[keyof typeof inlineFormats],
) {
  const { state } = view;
  const last = state.selection.ranges.at(-1)?.to ?? 0;
  const tree =
    ensureSyntaxTree(state, state.doc.lineAt(last).to, 30) ?? syntaxTree(state);
  const removed = new Set<number>();
  const transaction = state.changeByRange((range) => {
    const selected = state.sliceDoc(range.from, range.to);
    const value = selected.trim();
    if (selected && !value) return { range };
    const from = range.from + selected.length - selected.trimStart().length;
    const to = from + value.length;

    // Resolve a Markdown span so a single * never removes half of **.
    for (
      let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
        from,
        1,
      );
      node;
      node = node.parent
    ) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock')
        return { range };
      if (
        node.name === 'InlineCode' &&
        format.node !== 'InlineCode' &&
        (from > node.from || to < node.to)
      )
        return { range };
      if (node.name !== format.node || to > node.to) continue;
      const opening = node.firstChild;
      const closing = node.lastChild;
      if (!opening || !closing || opening.to >= closing.from) break;
      if (removed.has(opening.from)) return { range };
      removed.add(opening.from);
      const inner =
        format.node === 'InlineCode'
          ? state.sliceDoc(opening.to, closing.from)
          : '';
      const padding = Number(
        inner.startsWith(' ') && inner.endsWith(' ') && !!inner.trim(),
      );
      const changes = state.changes([
        { from: opening.from, to: opening.to + padding },
        { from: closing.from - padding, to: closing.to },
      ]);
      return { changes, range: range.map(changes) };
    }

    const mark = format.mark;
    const startMark = from - mark.length;
    const endMark = to + mark.length;
    if (
      value &&
      startMark >= 0 &&
      endMark <= state.doc.length &&
      state.sliceDoc(startMark, from) === mark &&
      state.sliceDoc(to, endMark) === mark &&
      !state
        .sliceDoc(Math.max(0, startMark - 1), startMark)
        .match(/[\\*_`~]/) &&
      state.sliceDoc(from, from + 1) !== mark[0] &&
      state.sliceDoc(to - 1, to) !== mark[0] &&
      state.sliceDoc(endMark, endMark + 1) !== mark[0]
    ) {
      const changes = state.changes([
        { from: startMark, to: from },
        { from: to, to: endMark },
      ]);
      return { changes, range: range.map(changes) };
    }

    const content = value || format.placeholder;
    let delimiter: string = mark;
    let pad = '';
    if (mark === '`') {
      let count = 1;
      for (const run of content.matchAll(/`+/g))
        count = Math.max(count, run[0].length + 1);
      delimiter = '`'.repeat(count);
      if (content.startsWith('`') || content.endsWith('`')) pad = ' ';
    }
    const start = from + delimiter.length + pad.length;
    const end = start + content.length;
    return {
      changes: {
        from,
        to,
        insert: delimiter + pad + content + pad + delimiter,
      },
      range:
        range.anchor <= range.head
          ? EditorSelection.range(start, end)
          : EditorSelection.range(end, start),
    };
  });
  if (!transaction.changes.empty)
    view.dispatch(transaction, {
      annotations: isolateHistory.of('full'),
      userEvent: 'input.format',
    });
}

const headings = {
  'heading-1': 1,
  heading: 2,
  'heading-3': 3,
  'heading-4': 4,
} as const;
type LineFormat = Exclude<
  FormatCommand,
  keyof typeof inlineFormats | 'link' | 'rule'
>;

function toggleLines(view: EditorView, command: LineFormat) {
  const { state } = view;
  const { doc, selection } = state;
  const tree =
    ensureSyntaxTree(state, doc.lineAt(selection.ranges.at(-1)!.to).to, 35) ??
    syntaxTree(state);
  const lines = new Set<number>();
  for (const range of selection.ranges) {
    const last = doc.lineAt(range.empty ? range.to : range.to - 1).number;
    for (let n = doc.lineAt(range.from).number; n <= last; n++) lines.add(n);
  }
  const selected = [...lines].flatMap((number) => {
    const line = doc.line(number);
    const indent = /^[ \t]*/.exec(line.text)?.[0].length ?? 0;
    const content =
      /^(?:[ \t]*>[ \t]?)*[ \t]*/.exec(line.text)?.[0].length ?? 0;
    for (
      let node: ReturnType<typeof tree.resolve> | null = tree.resolve(
        Math.min(line.to, line.from + content),
        1,
      );
      node;
      node = node.parent
    ) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') return [];
    }
    const list =
      /^(?<marker>[-+*]|\d{1,9}[.)])(?:[ \t]+|$)(?<task>\[[ xX]\](?:[ \t]+|$))?/.exec(
        line.text.slice(content),
      );
    const headingFrom = content + (list?.[0].length ?? 0);
    const heading = /^(#{1,6})(?:[ \t]+|$)/.exec(line.text.slice(headingFrom));
    const quote = /^>[ \t]?/.exec(line.text.slice(indent));
    return [{ line, indent, content, list, headingFrom, heading, quote }];
  });
  const level =
    command in headings ? headings[command as keyof typeof headings] : null;
  const active = selected.every(({ quote, list, heading }) => {
    switch (command) {
      case 'quote':
        return !!quote;
      case 'bullet':
        return !!list && /^[-+*]$/.test(list[1]) && !list.groups?.task;
      case 'ordered':
        return !!list && /^\d/.test(list[1]) && !list.groups?.task;
      case 'task':
        return !!list?.groups?.task;
      default:
        return !!heading && heading[1].length === level;
    }
  });
  const changes: ChangeSpec[] = [];
  const ordinalByDepth = new Map<string, number>();
  for (const {
    line,
    indent,
    content,
    list,
    headingFrom,
    heading,
    quote,
  } of selected) {
    const replace = (from: number, previous: string, insert: string) => {
      if (previous !== insert)
        changes.push({
          from: line.from + from,
          to: line.from + from + previous.length,
          insert,
        });
    };
    if (command === 'quote') {
      replace(indent, quote?.[0] ?? '', active ? '' : (quote?.[0] ?? '> '));
    } else if (
      command === 'bullet' ||
      command === 'ordered' ||
      command === 'task'
    ) {
      const depth = line.text.slice(0, content);
      const ordinal = (ordinalByDepth.get(depth) ?? 0) + 1;
      ordinalByDepth.set(depth, ordinal);
      const marker =
        command === 'ordered'
          ? `${ordinal}. `
          : command === 'task'
            ? `${list?.[1] ?? '-'} `
            : '- ';
      const task =
        command === 'task'
          ? (list?.groups?.task?.trimEnd() ?? '[ ]') + ' '
          : '';
      replace(content, list?.[0] ?? '', active ? '' : marker + task);
    } else {
      const previous = heading?.[1].length ?? 0;
      const next =
        command === 'heading-bigger'
          ? previous
            ? Math.max(1, previous - 1)
            : 0
          : command === 'heading-smaller'
            ? previous < 6
              ? previous + Number(!!previous)
              : 0
            : active
              ? 0
              : (level ?? 0);
      replace(
        headingFrom,
        heading?.[0] ?? '',
        next ? `${'#'.repeat(next)} ` : '',
      );
      if (heading && !next) {
        const closing = /[ \t]+#+[ \t]*$/.exec(
          line.text.slice(headingFrom + heading[0].length),
        );
        if (closing) replace(line.length - closing[0].length, closing[0], '');
      }
    }
  }
  if (!changes.length) return;
  const changeSet = state.changes(changes);
  view.dispatch({
    changes: changeSet,
    selection: selection.map(changeSet, 1),
    annotations: isolateHistory.of('full'),
    userEvent: 'input.format',
  });
}

export function formatSelection(
  view: EditorView,
  command: FormatCommand,
): void {
  if (view.state.readOnly) return;
  if (
    command === 'bold' ||
    command === 'italic' ||
    command === 'strike' ||
    command === 'code'
  ) {
    toggleInline(view, inlineFormats[command]);
    view.focus();
    return;
  }
  const { from, to } = view.state.selection.main;
  if (command === 'link') {
    const value = view.state.sliceDoc(from, to) || 'enlace';
    view.dispatch({
      changes: { from, to, insert: `[${value}](https://)` },
      selection: {
        anchor: from + 1,
        head: from + 1 + value.length,
      },
    });
  } else {
    if (command === 'rule') {
      const prefix = '\n\n* * *\n\n';
      view.dispatch({
        changes: { from: view.state.doc.lineAt(from).from, insert: prefix },
        selection: { anchor: from + prefix.length, head: to + prefix.length },
      });
    } else toggleLines(view, command);
  }
  view.focus();
}
