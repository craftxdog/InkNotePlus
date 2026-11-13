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
  return quoteBlocks(state, from, to).filter(
    (block): block is typeof block & { type: AlertType } => block.type !== null,
  );
}

function quoteBlocks(state: EditorState, from: number, to: number) {
  const blocks: Array<{
    from: number;
    to: number;
    type: AlertType | null;
    depth: number;
  }> = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false;
      if (node.name !== 'Blockquote') return;
      const first = state.doc.lineAt(node.from);
      const marker = /^ {0,3}>[\t ]*(.*)$/.exec(
        state.sliceDoc(node.from, first.to),
      );
      const type = marker ? alertTypeFromMarker(marker[1]) : null;
      let depth = 1;
      for (let parent = node.node.parent; parent; parent = parent.parent)
        if (parent.name === 'Blockquote') depth++;
      blocks.push({ from: node.from, to: node.to, type, depth });
    },
  });
  return blocks;
}

function decorate(view: EditorView): DecorationSet {
  const decorations: Array<ReturnType<Decoration['range']>> = [];
  const seen = new Set<number>();
  for (const visible of view.visibleRanges) {
    for (const block of quoteBlocks(view.state, visible.from, visible.to)) {
      const first = view.state.doc.lineAt(Math.max(block.from, visible.from));
      const last = view.state.doc.lineAt(Math.min(block.to - 1, visible.to));
      const header = view.state.doc.lineAt(block.from);
      for (let number = first.number; number <= last.number; number++) {
        const line = view.state.doc.line(number);
        // The outer quote owns the continuous rail; each nested marker keeps
        // its own alert color. Do not let a child recolor its parent's rail.
        if (!seen.has(line.from)) {
          seen.add(line.from);
          decorations.push(
            Decoration.line({
              class: block.type
                ? `md-blockquote-line md-alert-line md-alert-${block.type}`
                : 'md-blockquote-line',
            }).range(line.from),
          );
        }
        if (!block.type) continue;
        const prefix =
          /^(?:[\t ]*(?:>|[-+*][\t ]|\d+[.)][\t ]))+/.exec(line.text)?.[0] ??
          '';
        const marks = [...prefix.matchAll(/>/g)];
        const offset = marks[block.depth - 1]?.index;
        const markerFrom = offset === undefined ? null : line.from + offset;
        const markerTo =
          number === header.number
            ? line.to
            : markerFrom === null
              ? null
              : markerFrom + 1;
        if (markerFrom !== null && markerTo !== null && markerTo > markerFrom)
          decorations.push(
            Decoration.mark({
              class: `md-alert-marker md-alert-${block.type}`,
            }).range(markerFrom, markerTo),
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
