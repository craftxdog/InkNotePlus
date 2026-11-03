import type { EditorView } from '@codemirror/view';

export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'heading'
  | 'quote'
  | 'code'
  | 'bullet'
  | 'ordered'
  | 'link'
  | 'rule';

export function formatSelection(
  view: EditorView,
  command: FormatCommand,
): void {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  const wrappers: Partial<
    Record<FormatCommand, readonly [string, string, string]>
  > = {
    bold: ['**', '**', 'texto'],
    italic: ['*', '*', 'texto'],
    strike: ['~~', '~~', 'texto'],
    code: ['`', '`', 'código'],
    link: ['[', '](https://)', 'enlace'],
  };
  const wrap = wrappers[command];
  if (wrap) {
    const value = text || wrap[2];
    view.dispatch({
      changes: { from, to, insert: `${wrap[0]}${value}${wrap[1]}` },
      selection: {
        anchor: from + wrap[0].length,
        head: from + wrap[0].length + value.length,
      },
    });
  } else {
    const prefixes: Record<string, string> = {
      heading: '## ',
      quote: '> ',
      bullet: '- ',
      ordered: '1. ',
      rule: '\n\n---\n\n',
    };
    const line = view.state.doc.lineAt(from);
    const prefix = prefixes[command];
    if (command !== 'rule') {
      const last = view.state.doc.lineAt(to > from ? to - 1 : to);
      const changes = [];
      let added = 0;
      for (let number = line.number; number <= last.number; number++) {
        const insert =
          command === 'ordered' ? `${number - line.number + 1}. ` : prefix;
        changes.push({ from: view.state.doc.line(number).from, insert });
        added += insert.length;
      }
      view.dispatch({
        changes,
        selection: { anchor: from + prefix.length, head: to + added },
      });
      view.focus();
      return;
    }
    view.dispatch({
      changes: { from: line.from, insert: prefix },
      selection: { anchor: from + prefix.length, head: to + prefix.length },
    });
  }
  view.focus();
}
