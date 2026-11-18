import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import type { Command } from '@codemirror/view';
import type { SourceNode } from './markdown-source-map';

const opening = '<mark>';
const closing = '</mark>';
const safeInlineTag = /^<(\/?)(mark|sub|sup)>$/;

export const toggleHighlight: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const tree = syntaxTree(state);
  const transaction = state.changeByRange((range) => {
    for (
      let node: ReturnType<typeof tree.resolve> | null = tree.resolve(
        range.from,
        1,
      );
      node;
      node = node.parent
    ) {
      if (['InlineCode', 'CodeBlock', 'FencedCode'].includes(node.name))
        return { range };
    }
    if (
      state.sliceDoc(Math.max(0, range.from - opening.length), range.from) ===
        opening &&
      state.sliceDoc(range.to, range.to + closing.length) === closing
    ) {
      const changes = state.changes([
        { from: range.from - opening.length, to: range.from },
        { from: range.to, to: range.to + closing.length },
      ]);
      return { changes, range: range.map(changes) };
    }
    const value = state.sliceDoc(range.from, range.to) || 'texto';
    if (value.includes('\n\n')) return { range };
    const from = range.from + opening.length;
    const to = from + value.length;
    return {
      changes: {
        from: range.from,
        to: range.to,
        insert: opening + value + closing,
      },
      range:
        range.anchor <= range.head
          ? EditorSelection.range(from, to)
          : EditorSelection.range(to, from),
    };
  });
  if (transaction.changes.empty) return false;
  view.dispatch(transaction, {
    annotations: isolateHistory.of('full'),
    userEvent: 'input.format',
  });
  view.focus();
  return true;
};

// Only convert exact, balanced pairs of these tags to trusted AST nodes.
// Raw Markdown HTML stays disabled in ReactMarkdown.
export function remarkHighlights() {
  return (tree: SourceNode) => {
    function visit(parent: SourceNode) {
      if (!parent.children) return;
      const output: SourceNode[] = [];
      let start: SourceNode | undefined;
      let startTag = '';
      let content: SourceNode[] = [];
      for (const child of parent.children) {
        visit(child);
        const tag =
          child.type === 'html' ? safeInlineTag.exec(child.value ?? '') : null;
        if (tag && !tag[1] && !start) {
          start = child;
          startTag = tag[2];
        } else if (tag?.[1] && start && tag[2] === startTag) {
          const element: SourceNode = {
            type: 'inknoteHighlight',
            data: { hName: startTag },
            children: content,
            position:
              start.position && child.position
                ? { start: start.position.start, end: child.position.end }
                : undefined,
          };
          // Tags nested in this pair were collected as plain siblings.
          visit(element);
          output.push(element);
          start = undefined;
          content = [];
        } else (start ? content : output).push(child);
      }
      parent.children = start ? output.concat(start, content) : output;
    }
    visit(tree);
  };
}
