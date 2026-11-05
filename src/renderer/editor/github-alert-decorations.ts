import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { alertTypeFromMarker, type AlertType } from './github-alerts';

export function alertBlocks(
  state: EditorState,
  from = 0,
  to = state.doc.length,
) {
  const blocks: Array<{ from: number; to: number; type: AlertType }> = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false;
      if (node.name !== 'Blockquote' || node.node.parent?.name !== 'Document')
        return;
      const first = state.doc.lineAt(node.from);
      const marker = /^ {0,3}>[\t ]*(.*)$/.exec(first.text);
      const type = marker ? alertTypeFromMarker(marker[1]) : null;
      if (type) blocks.push({ from: node.from, to: node.to, type });
      return false;
    },
  });
  return blocks;
}

function decorate(view: EditorView): DecorationSet {
  const decorations: Array<ReturnType<Decoration['range']>> = [];
  const seen = new Set<number>();
  for (const visible of view.visibleRanges) {
    for (const block of alertBlocks(view.state, visible.from, visible.to)) {
      const first = view.state.doc.lineAt(Math.max(block.from, visible.from));
      const last = view.state.doc.lineAt(Math.min(block.to - 1, visible.to));
      const header = view.state.doc.lineAt(block.from);
      for (let number = first.number; number <= last.number; number++) {
        const line = view.state.doc.line(number);
        if (seen.has(line.from)) continue;
        seen.add(line.from);
        decorations.push(
          Decoration.line({
            class: `md-alert-line md-alert-${block.type}`,
          }).range(line.from),
        );
        const quote = /^ {0,3}>/.exec(line.text);
        const markerFrom =
          number === header.number
            ? line.from
            : quote
              ? line.from + quote[0].length - 1
              : null;
        const markerTo =
          number === header.number
            ? line.to
            : markerFrom === null
              ? null
              : markerFrom + 1;
        if (markerFrom !== null && markerTo !== null && markerTo > markerFrom)
          decorations.push(
            Decoration.mark({ class: 'md-alert-marker' }).range(
              markerFrom,
              markerTo,
            ),
          );
      }
    }
  }
  return Decoration.set(decorations, true);
}

export const githubAlertDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = decorate(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
