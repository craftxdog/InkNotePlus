import type { EditorView } from '@codemirror/view';

const selector = '[data-source-text-line]';

// Text nodes keep decoded entities and escaped punctuation; map their UTF-16
// offsets back to source characters without treating Markdown syntax as text.
export function sourceTextOffsets(
  source: string,
  text: string,
  document: Document,
) {
  const offsets: number[] = [];
  const decoder = document.createElement('textarea');
  let raw = 0,
    rendered = 0;
  while (raw < source.length && rendered < text.length) {
    let token = source[raw],
      length = 1;
    if (
      token === '\\' &&
      /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(source[raw + 1] ?? '')
    ) {
      token = source[raw + 1];
      length = 2;
    } else if (token === '&') {
      const entity = /^&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/i.exec(
        source.slice(raw),
      );
      if (entity) {
        // Only a single validated character reference is parsed, never note HTML.
        decoder.innerHTML = entity[0];
        token = decoder.value;
        length = entity[0].length;
      }
    }
    if (text.startsWith(token, rendered)) {
      for (let index = 0; index < token.length; index++) offsets.push(raw);
      rendered += token.length;
      raw += length;
    } else raw++;
  }
  offsets.push(source.length);
  return offsets;
}

export interface TextRange {
  from: number;
  to: number;
  text: Text;
}

// Rendered text in source order. Footnotes render at the end but sort by source.
export function collectTextRanges(view: EditorView, preview: HTMLElement) {
  const ranges: TextRange[] = [];
  for (const span of preview.querySelectorAll<HTMLElement>(selector)) {
    const range = spanRange(view, span);
    if (range) ranges.push(range);
  }
  return ranges.sort((a, b) => a.from - b.from || a.to - b.to);
}

function spanRange(view: EditorView, span: HTMLElement): TextRange | null {
  const line = Number(span.dataset.sourceTextLine),
    endLine = Number(span.dataset.sourceTextEndLine);
  if (
    line < 1 ||
    endLine > view.state.doc.lines ||
    !Number.isInteger(line) ||
    !Number.isInteger(endLine)
  )
    return null;
  const from =
    view.state.doc.line(line).from + Number(span.dataset.sourceTextColumn) - 1;
  const to =
    view.state.doc.line(endLine).from +
    Number(span.dataset.sourceTextEndColumn) -
    1;
  const text = span.firstChild;
  return text?.nodeType === Node.TEXT_NODE &&
    from >= 0 &&
    to >= from &&
    to <= view.state.doc.length
    ? { from, to, text: text as Text }
    : null;
}

function characterRect(text: Text, offset: number) {
  const range = text.ownerDocument.createRange();
  const start = Math.max(0, Math.min(text.length - 1, offset));
  range.setStart(text, start);
  range.setEnd(text, Math.min(start + 1, text.length));
  return range.getBoundingClientRect();
}

export function previewAtSource(
  view: EditorView,
  preview: HTMLElement,
  position: number,
  referenceY?: number,
  ranges: readonly TextRange[] = collectTextRanges(view, preview),
) {
  let before: TextRange | null = null,
    after: TextRange | null = null,
    containing: TextRange | null = null;
  for (const range of ranges) {
    if (range.from <= position && range.to >= position) {
      containing = range;
      break;
    }
    if (range.to < position && (!before || range.to > before.to))
      before = range;
    if (range.from > position && (!after || range.from < after.from))
      after = range;
  }
  const caret = view.coordsAtPos(position);
  const reference =
    referenceY ?? (caret ? (caret.top + caret.bottom) / 2 : undefined);
  // Hidden URLs can occupy several wrapped rows. Choose the closest visible
  // source row, rather than counting Markdown characters that have no glyph.
  const candidates = containing ? [containing] : [after, before];
  let closest: TextRange | null = null,
    distance = Infinity;
  for (const range of candidates) {
    if (!range) continue;
    const sourcePosition = Math.max(
      range.from,
      Math.min(range.to - 1, position),
    );
    const coordinates = view.coordsAtPos(sourcePosition);
    const gap =
      reference !== undefined && coordinates
        ? Math.abs((coordinates.top + coordinates.bottom) / 2 - reference)
        : Math.abs(sourcePosition - position);
    if (gap < distance) {
      closest = range;
      distance = gap;
    }
  }
  if (!closest) return null;
  const { from, to } = closest;
  // Do not jump to a different block while editing code or an equation.
  if (
    view.state.doc.lineAt(position).number <
      view.state.doc.lineAt(from).number ||
    view.state.doc.lineAt(position).number > view.state.doc.lineAt(to).number
  )
    return null;
  return previewGlyph(view, preview, closest, position);
}

// The preview position of the rendered letter for a source position.
export function previewGlyph(
  view: EditorView,
  preview: HTMLElement,
  { from, to, text }: TextRange,
  position: number,
) {
  const source = view.state.doc.sliceString(from, to),
    raw = Math.max(0, position - from);
  const offsets =
    source.length === text.length
      ? null
      : sourceTextOffsets(source, text.data, preview.ownerDocument);
  let offset = raw;
  if (offsets) {
    offset = 0;
    while (offset + 1 < offsets.length && offsets[offset + 1] <= raw) offset++;
  }
  offset = Math.max(0, Math.min(text.length - 1, offset));
  const rect = characterRect(text, offset);
  return rect.height
    ? {
        position: from + (offsets?.[offset] ?? offset),
        y: rect.top - preview.getBoundingClientRect().top + preview.scrollTop,
      }
    : null;
}

// Letter `index` of a rendered range, in preview content coordinates.
export function previewLetter(
  view: EditorView,
  preview: HTMLElement,
  { from, to, text }: TextRange,
  index: number,
) {
  const offset = Math.max(0, Math.min(text.length - 1, index));
  const rect = characterRect(text, offset);
  if (!rect.height) return null;
  const source = view.state.doc.sliceString(from, to);
  const position =
    source.length === text.length
      ? offset
      : sourceTextOffsets(source, text.data, preview.ownerDocument)[offset];
  if (position === undefined) return null;
  const top =
    rect.top - preview.getBoundingClientRect().top + preview.scrollTop;
  return { position: from + position, top, bottom: top + rect.height };
}

// First letter whose row ends below `y` (preview content coordinates).
export function previewLetterIndex(
  preview: HTMLElement,
  { text }: TextRange,
  y: number,
) {
  const offset = preview.getBoundingClientRect().top - preview.scrollTop;
  let low = 0,
    high = text.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (characterRect(text, middle).bottom - offset <= y) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Vertical extent of a rendered range, in preview content coordinates.
export function previewRangeBox(preview: HTMLElement, { text }: TextRange) {
  const range = text.ownerDocument.createRange();
  range.selectNodeContents(text);
  const rect = range.getBoundingClientRect();
  const top =
    rect.top - preview.getBoundingClientRect().top + preview.scrollTop;
  return { top, bottom: top + rect.height };
}

export function sourceAtPreview(view: EditorView, preview: HTMLElement) {
  const bounds = preview.getBoundingClientRect();
  const referenceY = bounds.top + preview.clientHeight * 0.35;
  for (const span of preview.querySelectorAll<HTMLElement>(selector)) {
    const box = span.getBoundingClientRect(),
      range = spanRange(view, span);
    if (!range || box.bottom <= referenceY || box.top >= bounds.bottom)
      continue;
    let low = 0,
      high = range.text.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (characterRect(range.text, middle).bottom <= referenceY)
        low = middle + 1;
      else high = middle;
    }
    const rect = characterRect(range.text, low);
    const source = view.state.doc.sliceString(range.from, range.to);
    const offset =
      source.length === range.text.length
        ? low
        : sourceTextOffsets(source, range.text.data, preview.ownerDocument)[
            low
          ];
    if (rect.height && offset !== undefined)
      return { position: range.from + offset, y: rect.top - bounds.top };
  }
  return null;
}
