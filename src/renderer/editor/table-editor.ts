import { isolateHistory } from '@codemirror/commands';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type Text,
} from '@codemirror/state';
import type { EditorView, Command } from '@codemirror/view';
import { maxBodyLength } from '../../shared/ipc';

type MarkdownNode = ReturnType<ReturnType<typeof syntaxTree>['resolve']>;
type Cell = { value: string; from: number; to: number; end: number };
type Alignment = 'left' | 'right' | 'center' | 'none';
const exitTable = StateEffect.define<boolean>();
export const tableEditing = StateField.define<boolean>({
  create: () => true,
  update(active, transaction) {
    const effect = transaction.effects.find((effect) => effect.is(exitTable));
    return effect
      ? !effect.value
      : transaction.selection || transaction.docChanged
        ? true
        : active;
  },
});

export function tableAtCursor(state: EditorState) {
  if (
    state.selection.ranges.length !== 1 ||
    state.field(tableEditing, false) === false
  )
    return null;
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  const tree = syntaxTree(state);
  for (
    let node: MarkdownNode | null = tree.resolve(
      head,
      head === line.to ? -1 : 1,
    );
    node;
    node = node.parent
  ) {
    if (node.name === 'Table') return node;
  }
  return null;
}

function splitCells(text: string, offset: number): Cell[] {
  const cells: Cell[] = [];
  let start = 0;
  function append(end: number) {
    const raw = text.slice(start, end);
    const value = raw.trim();
    const from = start + raw.length - raw.trimStart().length;
    cells.push({
      value,
      from: offset + from,
      to: offset + from + value.length,
      end: offset + end,
    });
  }
  for (const match of text.matchAll(/\\[^\n]|\|/g)) {
    if (match[0] !== '|') continue;
    append(match.index);
    start = match.index + 1;
  }
  append(text.length);
  if (cells.length > 1 && !cells[0].value) cells.shift();
  if (cells.length > 1 && !cells.at(-1)?.value) cells.pop();
  return cells;
}

function rowCells(doc: Text, row: MarkdownNode) {
  return splitCells(doc.sliceString(row.from, row.to), row.from);
}

function rowAt(doc: Text, table: MarkdownNode, line: number) {
  const target = doc.line(line);
  for (
    let node = table.childAfter(target.from);
    node && node.from <= target.to;
    node = node.nextSibling
  ) {
    if (node.name !== 'QuoteMark') return node;
  }
  return null;
}

function columnAt(cells: Cell[], position: number) {
  const column = cells.findIndex((cell) => cell.end >= position);
  return column < 0 ? cells.length - 1 : column;
}

function selectCell(view: EditorView, cells: Cell[], column: number) {
  const cell = cells[Math.min(cells.length - 1, Math.max(0, column))];
  if (cell)
    view.dispatch({
      selection: { anchor: cell.from, head: cell.to },
      scrollIntoView: true,
    });
  return true;
}

const escape: Command = (view) => {
  if (!tableAtCursor(view.state)) return false;
  view.dispatch({ effects: exitTable.of(true) });
  return true;
};

function navigate(
  kind:
    | 'select'
    | 'next'
    | 'previous'
    | 'row'
    | 'left'
    | 'right'
    | 'up'
    | 'down',
): Command {
  return (view) => {
    const { state } = view;
    const table = tableAtCursor(state);
    if (!table) return false;
    const { doc } = state;
    const head = state.selection.main.head;
    const first = doc.lineAt(table.from).number;
    const last = doc.lineAt(table.to).number;
    const current = doc.lineAt(head).number;
    const row = rowAt(doc, table, current);
    if (!row) return false;
    const cells = rowCells(doc, row);
    let column = columnAt(cells, head);
    let target = current;
    if (kind === 'left' || kind === 'previous') column--;
    if (kind === 'right' || kind === 'next') column++;
    if (kind === 'up') target--;
    if (kind === 'down' || kind === 'row') target++;
    if (kind === 'next' && column >= cells.length) {
      target++;
      column = 0;
    }
    if (kind === 'previous' && column < 0) {
      target--;
      column = Infinity;
    }
    if (target === first + 1 && target !== current)
      target += target > current ? 1 : -1;
    if (
      target > last &&
      (kind === 'next' || kind === 'row') &&
      !state.readOnly
    ) {
      const header = table.firstChild;
      if (!header) return true;
      const columns = rowCells(doc, header).length;
      const separator = table.getChild('TableDelimiter');
      if (!separator) return true;
      const prefix = doc.sliceString(
        doc.lineAt(separator.from).from,
        separator.from,
      );
      const text = `|${'   |'.repeat(columns)}`;
      const at = doc.line(last).to;
      const insert = `\n${prefix}${text}`;
      if (doc.length + insert.length > maxBodyLength) return true;
      const newCells = splitCells(text, at + 1 + prefix.length);
      const cell = newCells[Math.min(column, columns - 1)];
      view.dispatch({
        changes: { from: at, insert },
        selection: { anchor: cell.from },
        scrollIntoView: true,
        annotations: isolateHistory.of('full'),
        userEvent: 'input.table',
      });
      return true;
    }
    if (target < first || target > last) return true;
    const next = rowAt(doc, table, target);
    return next ? selectCell(view, rowCells(doc, next), column) : true;
  };
}

function alignmentOf(value: string): Alignment {
  if (value.startsWith(':')) return value.endsWith(':') ? 'center' : 'left';
  return value.endsWith(':') ? 'right' : 'none';
}

function tableContent(doc: Text, table: MarkdownNode) {
  const rows: string[][] = [];
  const prefixes: string[] = [];
  let alignments: Alignment[] = [];
  for (let row = table.firstChild; row; row = row.nextSibling) {
    if (row.name === 'QuoteMark') continue;
    const values = rowCells(doc, row).map((cell) => cell.value);
    prefixes.push(doc.sliceString(doc.lineAt(row.from).from, row.from));
    if (row.name === 'TableDelimiter') alignments = values.map(alignmentOf);
    else rows.push(values);
  }
  let columns = alignments.length;
  for (const row of rows) columns = Math.max(columns, row.length);
  return { rows, alignments, prefixes, columns };
}

function renderTable(
  rows: string[][],
  alignments: Alignment[],
  prefixes: string[],
  columns: number,
  limit: number,
) {
  const widths = Array<number>(columns).fill(3);
  alignments.forEach((align, index) => {
    if (align !== 'none') widths[index] = align === 'center' ? 5 : 4;
  });
  for (const row of rows)
    row.forEach(
      (value, index) => (widths[index] = Math.max(widths[index], value.length)),
    );
  const rowLength = widths.reduce((sum, width) => sum + width + 3, 1);
  if ((rows.length + 1) * (rowLength + 1) > limit) return null;
  const lines = rows.map(
    (row) =>
      `| ${widths.map((width, i) => (row[i] ?? '').padEnd(width)).join(' | ')} |`,
  );
  const rule = widths.map((width, index) => {
    const align = alignments[index];
    const start = align === 'left' || align === 'center' ? ':' : '';
    const end = align === 'right' || align === 'center' ? ':' : '';
    return start + '-'.repeat(width - start.length - end.length) + end;
  });
  lines.splice(1, 0, `| ${rule.join(' | ')} |`);
  const separatorPrefix = prefixes[1] ?? '';
  const fullLines = lines.map((line, i) =>
    i ? (prefixes[i] ?? separatorPrefix) + line : line,
  );
  const text = fullLines.join('\n');
  return text.length <= limit ? { text, lines, fullLines } : null;
}

type Mutation =
  | 'format'
  | 'insert-row'
  | 'delete-row'
  | 'insert-column'
  | 'delete-column'
  | 'move-row-up'
  | 'move-row-down'
  | 'move-column-left'
  | 'move-column-right'
  | `align-${Alignment}`;

function mutate(kind: Mutation): Command {
  return (view) => {
    const { state } = view;
    const table = tableAtCursor(state);
    if (!table || state.readOnly) return false;
    const { doc } = state;
    const currentLine = doc.lineAt(state.selection.main.head).number;
    const firstLine = doc.lineAt(table.from).number;
    const current = rowAt(doc, table, currentLine);
    if (!current) return false;
    const {
      rows,
      alignments,
      prefixes,
      columns: previousColumns,
    } = tableContent(doc, table);
    let columns = previousColumns;
    let row = Math.max(0, currentLine - firstLine - 1);
    let col = columnAt(rowCells(doc, current), state.selection.main.head);
    const limit = maxBodyLength - (doc.length - (table.to - table.from));
    if (kind.startsWith('align-')) {
      alignments[col] = kind.slice(6) as Alignment;
    } else if (kind === 'insert-row') {
      rows.splice(++row, 0, []);
    } else if (kind === 'delete-row') {
      if (row === 0) return true;
      rows.splice(row, 1);
      row = Math.min(row, rows.length - 1);
    } else if (kind === 'move-row-up' || kind === 'move-row-down') {
      const next = row + (kind === 'move-row-up' ? -1 : 1);
      if (row < 1 || next < 1 || next >= rows.length) return true;
      [rows[row], rows[next]] = [rows[next], rows[row]];
      row = next;
    } else if (kind !== 'format') {
      if ((rows.length + 1) * (columns + 1) * 6 > limit) return true;
      while (alignments.length < columns) alignments.push('none');
      if (kind === 'insert-column') {
        alignments.splice(col + 1, 0, 'none');
        for (const cells of rows) cells.splice(col + 1, 0, '');
        col++;
        columns++;
      } else if (kind === 'delete-column') {
        if (columns <= 1) return true;
        alignments.splice(col, 1);
        for (const cells of rows) cells.splice(col, 1);
        col = Math.min(col, --columns - 1);
      } else {
        const next = col + (kind === 'move-column-left' ? -1 : 1);
        if (next < 0 || next >= columns) return true;
        [alignments[col], alignments[next]] = [
          alignments[next],
          alignments[col],
        ];
        for (const values of rows) {
          [values[col], values[next]] = [values[next] ?? '', values[col] ?? ''];
          for (let i = 0; i < values.length; i++) values[i] ??= '';
        }
        col = next;
      }
    }
    const result = renderTable(rows, alignments, prefixes, columns, limit);
    if (!result) return true;
    const lineIndex = row > 0 ? row + 1 : 0;
    const offset = result.fullLines
      .slice(0, lineIndex)
      .reduce((sum, line) => sum + line.length + 1, table.from);
    const cell = splitCells(
      result.lines[lineIndex],
      offset +
        result.fullLines[lineIndex].length -
        result.lines[lineIndex].length,
    )[col];
    const selection = EditorSelection.range(cell.from, cell.to);
    const changes =
      result.text === doc.sliceString(table.from, table.to)
        ? undefined
        : { from: table.from, to: table.to, insert: result.text };
    view.dispatch({
      changes,
      selection,
      scrollIntoView: true,
      annotations: isolateHistory.of('full'),
      userEvent: 'input.table',
    });
    return true;
  };
}

const formatAll: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const tree = ensureSyntaxTree(state, state.doc.length, 100);
  if (!tree) return false;
  let available = maxBodyLength - state.doc.length;
  const changes: { from: number; to: number; insert: string }[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== 'Table') return;
      const { rows, alignments, prefixes, columns } = tableContent(
        state.doc,
        node.node,
      );
      const length = node.to - node.from;
      const result = renderTable(
        rows,
        alignments,
        prefixes,
        columns,
        available + length,
      );
      if (result && result.text !== state.sliceDoc(node.from, node.to)) {
        available -= result.text.length - length;
        changes.push({ from: node.from, to: node.to, insert: result.text });
      }
      return false;
    },
  });
  if (changes.length)
    view.dispatch({
      changes,
      annotations: isolateHistory.of('full'),
      userEvent: 'input.table',
    });
  return !!changes.length;
};

export const tableCommands = {
  'table-editor:select-cell': navigate('select'),
  'table-editor:next-cell': navigate('next'),
  'table-editor:previous-cell': navigate('previous'),
  'table-editor:next-row': navigate('row'),
  'table-editor:escape': escape,
  'table-editor:move-left': navigate('left'),
  'table-editor:move-right': navigate('right'),
  'table-editor:move-up': navigate('up'),
  'table-editor:move-down': navigate('down'),
  'table-editor:format': mutate('format'),
  'table-editor:format-all': formatAll,
  'table-editor:align-left': mutate('align-left'),
  'table-editor:align-center': mutate('align-center'),
  'table-editor:align-right': mutate('align-right'),
  'table-editor:align-none': mutate('align-none'),
  'table-editor:insert-row': mutate('insert-row'),
  'table-editor:delete-row': mutate('delete-row'),
  'table-editor:insert-column': mutate('insert-column'),
  'table-editor:delete-column': mutate('delete-column'),
  'table-editor:move-row-up': mutate('move-row-up'),
  'table-editor:move-row-down': mutate('move-row-down'),
  'table-editor:move-column-left': mutate('move-column-left'),
  'table-editor:move-column-right': mutate('move-column-right'),
};
