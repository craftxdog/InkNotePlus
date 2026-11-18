const allMatches = 'inknote-preview-find';
const currentMatch = 'inknote-preview-find-current';
const maximumMatches = 2000;
const ignored =
  '.codeblock-actions, .mde-preview-code-line-number, .katex-mathml, svg';
const blocks = 'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote';

// Syntax highlighting splits one word across several text nodes, so matches run
// over the joined text of each block and map back to DOM positions.
export function findPreviewMatches(pane: HTMLElement, query: string) {
  const root = pane.querySelector('.mde-preview');
  if (!root || !query.trim()) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(ignored)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const segments: { node: Text; start: number }[] = [];
  let text = '';
  let block: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner = node.parentElement?.closest(blocks) ?? null;
    if (owner !== block) text += '\0';
    block = owner;
    segments.push({ node: node as Text, start: text.length });
    text += node.nodeValue ?? '';
  }
  const locate = (offset: number, end: boolean) => {
    for (let index = segments.length - 1; index >= 0; index--) {
      const { node, start } = segments[index];
      if (end ? start < offset : start <= offset)
        return { node, offset: offset - start };
    }
    return null;
  };
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'giu',
  );
  const ranges: Range[] = [];
  for (const match of text.matchAll(pattern)) {
    if (ranges.length === maximumMatches) break;
    const from = locate(match.index, false);
    const to = locate(match.index + match[0].length, true);
    if (!from || !to) continue;
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    ranges.push(range);
  }
  return ranges;
}

// Custom highlights paint matches without changing the rendered preview.
// https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API
export function paintPreviewMatches(
  ranges: readonly Range[],
  current: Range | undefined,
) {
  if (typeof Highlight === 'undefined' || !('highlights' in CSS)) return;
  CSS.highlights.set(allMatches, new Highlight(...ranges));
  CSS.highlights.set(
    currentMatch,
    current ? new Highlight(current) : new Highlight(),
  );
}

export function clearPreviewMatches() {
  if (typeof Highlight === 'undefined' || !('highlights' in CSS)) return;
  CSS.highlights.delete(allMatches);
  CSS.highlights.delete(currentMatch);
}
