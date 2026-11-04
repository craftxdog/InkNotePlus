import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

const sizeExpression =
  /(^|\s)(width|height|w|h):(\d+(?:\.\d+)?)(%|px|pt|pc|in|cm|mm|em|ex|ch)?(?=\s|$)/gi;
export function parseImageDimensions(alt: string) {
  const dimensions: { width?: string; height?: string } = {};
  const caption = alt
    .replace(
      sizeExpression,
      (
        _all,
        space: string,
        key: string,
        value: string,
        unit: string | undefined,
      ) => {
        if (Number(value) > 100_000) return _all;
        dimensions[/^(w|width)$/i.test(key) ? 'width' : 'height'] =
          `${Number(value)}${unit || 'px'}`;
        return space;
      },
    )
    .replace(/\s+/g, ' ')
    .trim();
  return { ...dimensions, caption };
}
export function imageAtCursor(view: EditorView) {
  let node = syntaxTree(view.state).resolveInner(
    view.state.selection.main.head,
    -1,
  );
  while (node.parent && node.name !== 'Image') node = node.parent;
  if (node.name !== 'Image') return null;
  const source = view.state.sliceDoc(node.from, node.to);
  const alt = /^!\[((?:\\.|[^\]\\])*)\]/.exec(source);
  return alt
    ? { from: node.from + 2, to: node.from + alt[1].length + 2, alt: alt[1] }
    : null;
}
export function resizeCurrentImage(
  view: EditorView,
  width: '' | 'auto' | '30%' | '50%' | '100%',
) {
  const image = imageAtCursor(view);
  if (!image) return false;
  const caption = parseImageDimensions(image.alt).caption;
  view.dispatch({
    changes: {
      from: image.from,
      to: image.to,
      insert: [caption, width && width !== 'auto' ? `width:${width}` : '']
        .filter(Boolean)
        .join(' '),
    },
    userEvent: 'input',
  });
  view.focus();
  return true;
}
