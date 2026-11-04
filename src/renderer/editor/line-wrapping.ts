import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { LineWrapping } from '../../shared/preferences';

// Inkdrop 6.2: Off, All Lines, Prose Only and Unwrap at Cursor.
// https://forum.inkdrop.app/t/inkdrop-desktop-v6-2-0/5603
export function unwrappedBlocks(
  state: EditorState,
  mode: LineWrapping,
  from = 0,
  to = state.doc.length,
) {
  const blocks: Array<{ from: number; to: number }> = [];
  if (mode !== 'prose' && mode !== 'cursor') return blocks;
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (!['FencedCode', 'CodeBlock', 'Table'].includes(node.name)) return;
      if (
        mode === 'prose' ||
        state.selection.ranges.some(
          (range) => range.from >= node.from && range.to <= node.to,
        )
      )
        blocks.push({ from: node.from, to: node.to });
      return false;
    },
  });
  return blocks;
}

export function lineWrappingExtension(mode: LineWrapping) {
  if (mode === 'off') return [];
  if (mode === 'all') return [EditorView.lineWrapping];
  const decorate = (view: EditorView) => {
    const lines = new Set<number>();
    for (const visible of view.visibleRanges) {
      for (const block of unwrappedBlocks(
        view.state,
        mode,
        visible.from,
        visible.to,
      )) {
        const first = view.state.doc.lineAt(Math.max(block.from, visible.from));
        const last = view.state.doc.lineAt(Math.min(block.to, visible.to));
        for (let number = first.number; number <= last.number; number++)
          lines.add(view.state.doc.line(number).from);
      }
    }
    return Decoration.set(
      [...lines]
        .sort((a, b) => a - b)
        .map((position) =>
          Decoration.line({ class: 'inknote-unwrapped' }).range(position),
        ),
    );
  };
  return [
    EditorView.lineWrapping,
    EditorView.theme({
      '.cm-content.cm-lineWrapping': { minWidth: '0' },
      '.cm-line.inknote-unwrapped': {
        whiteSpace: 'pre',
        wordBreak: 'normal',
        overflowWrap: 'normal',
        width: 'max-content',
        minWidth: '100%',
        boxSizing: 'border-box',
      },
    }),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = decorate(view);
        }
        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged ||
            syntaxTree(update.startState) !== syntaxTree(update.state)
          )
            this.decorations = decorate(update.view);
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
  ];
}
