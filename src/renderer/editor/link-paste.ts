import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { externalLinkSchema } from '../../shared/external-link';
import { linkedNoteId } from '../../shared/note-link';

const literalNodes = new Set([
  'InlineCode',
  'FencedCode',
  'CodeBlock',
  'CodeText',
  'Link',
  'Image',
  'URL',
]);

export const isExternalUrl = (value: string) =>
  !/\s/.test(value) && externalLinkSchema.safeParse({ url: value }).success;
const isLinkTarget = (value: string) =>
  isExternalUrl(value) || (!/\s/.test(value) && !!linkedNoteId(value));

export const linkDestination = (url: string) =>
  url.replace(/\(/g, '%28').replace(/\)/g, '%29');

export function isLiteralMarkdown(
  state: EditorState,
  from: number,
  to: number,
) {
  const tree = syntaxTree(state);
  for (const [position, side] of [
    [from, 1],
    [to, -1],
  ] as const) {
    for (
      let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
        position,
        side,
      );
      node;
      node = node.parent
    )
      if (literalNodes.has(node.name)) return true;
  }
  return false;
}

// Pasting a URL over selected words links them. Other pastes stay untouched.
export function pasteLinkOverSelection(view: EditorView, pasted: string) {
  const { state } = view;
  const url = pasted.trim();
  const range = state.selection.main;
  if (
    state.readOnly ||
    state.selection.ranges.length !== 1 ||
    range.empty ||
    !isLinkTarget(url)
  )
    return false;
  const label = state.sliceDoc(range.from, range.to);
  if (label.includes('\n') || isLinkTarget(label.trim())) return false;
  if (isLiteralMarkdown(state, range.from, range.to)) return false;
  const insert = `[${label.replace(/(?<!\\)[[\]]/g, '\\$&')}](${linkDestination(url)})`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
  return true;
}
