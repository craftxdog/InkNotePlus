import type { EditorView } from '@codemirror/view';
import { MapMode, type ChangeDesc } from '@codemirror/state';
import {
  collectTextRanges,
  previewAtSource,
  previewGlyph,
  previewLetter,
  previewLetterIndex,
  previewRangeBox,
  type TextRange,
} from './preview-source-position';

export interface ScrollAnchor {
  editor: number;
  preview: number;
}
type Pane = 'editor' | 'preview';
export function mapScroll(
  anchors: readonly ScrollAnchor[],
  position: number,
  from: Pane,
): number {
  const to = from === 'editor' ? 'preview' : 'editor';
  if (!anchors.length) return 0;
  let low = 0,
    high = anchors.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (anchors[middle][from] <= position) low = middle;
    else high = middle - 1;
  }
  const left = anchors[low],
    right = anchors[Math.min(low + 1, anchors.length - 1)];
  const span = right[from] - left[from];
  return (
    left[to] +
    (span > 0
      ? Math.max(0, Math.min(1, (position - left[from]) / span)) *
        (right[to] - left[to])
      : 0)
  );
}

// Reading row inside a pane: 35% down, sliding to the top edge at the start
// and to the bottom edge at the end, so both ends of the panes meet exactly.
export function referenceOffset(pane: HTMLElement) {
  const height = pane.clientHeight,
    reading = height * 0.35;
  const remaining = Math.max(0, pane.scrollHeight - height - pane.scrollTop);
  return Math.min(
    height,
    Math.min(reading, pane.scrollTop) +
      Math.max(0, height - reading - remaining),
  );
}

export function createScrollSync(
  view: EditorView,
  preview: HTMLElement,
  isPreviewCurrent = () => true,
) {
  let anchors: ScrollAnchor[] = [];
  let dirty = true,
    frame = 0,
    enabled = true;
  let owner: Pane = 'editor';
  let followCursor = false;
  const expected: Partial<Record<Pane, number>> = {};
  const editor = view.scrollDOM;
  let lastEditorTop = editor.scrollTop;
  let lastSourcePosition: number | null = null;
  let ranges: TextRange[] | null = null;
  const textRanges = () => (ranges ??= collectTextRanges(view, preview));
  // Rendered ranges in preview order, with their measured vertical extent.
  let boxes: { range: TextRange; top: number; bottom: number }[] | null = null;
  const textBoxes = () =>
    (boxes ??= textRanges()
      .map((range) => ({ range, ...previewRangeBox(preview, range) }))
      .filter((box) => box.bottom > box.top)
      .sort((a, b) => a.top - b.top || a.bottom - b.bottom));
  // Screen top of a source position, estimated when CodeMirror has not drawn it.
  const editorTop = (position: number) =>
    view.coordsAtPos(position)?.top ??
    view.documentTop + view.lineBlockAt(position).top;
  // A letter's position in both panes, in scroll content coordinates.
  function letterPoint(position: number, range: TextRange, bounds: DOMRect) {
    const glyph = previewGlyph(view, preview, range, position);
    return glyph
      ? {
          position: glyph.position,
          editor: editorTop(glyph.position) - bounds.top + editor.scrollTop,
          preview: glyph.y,
        }
      : null;
  }
  // Blends the letters around the reference row so the preview moves without
  // jumps. Blank lines, code, formulas and diagrams lie between two letters;
  // their measured block edges keep the blend true to their rendered height.
  function blendedScroll(referenceY: number, bounds: DOMRect, left: number) {
    const position = view.posAtCoords({ x: left, y: referenceY }, false);
    const list = textRanges();
    if (position === null || !list.length) return null;
    let low = 0,
      high = list.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (list[middle].from <= position) low = middle;
      else high = middle - 1;
    }
    let before: ReturnType<typeof letterPoint> = null;
    for (let index = low; index >= 0 && index > low - 64; index--) {
      const range = list[index];
      if (range.from > position || range.to <= range.from) continue;
      before = letterPoint(Math.min(position, range.to - 1), range, bounds);
      break;
    }
    const row = view.coordsAtPos(position);
    const next = row
      ? view.posAtCoords({ x: left, y: row.bottom + 1 }, false)
      : null;
    let after: ReturnType<typeof letterPoint> = null;
    for (
      let index = Math.max(0, low - 1);
      index < list.length && index < low + 64;
      index++
    ) {
      const range = list[index];
      if (
        next !== null &&
        next > position &&
        range.from <= next &&
        range.to > next
      ) {
        after = letterPoint(next, range, bounds);
        break;
      }
      if (range.from > position) {
        after = letterPoint(range.from, range, bounds);
        break;
      }
    }
    const reference = referenceY - bounds.top + editor.scrollTop;
    const offset = reference - editor.scrollTop;
    const real = before ?? after;
    if (!real) return null;
    lastSourcePosition = real.position;
    const pair = edges(before, after);
    return pair
      ? blend(...pair, reference, 'editor') - offset
      : real.preview - (real.editor - editor.scrollTop);
  }
  // Interpolates between two measured letters, through the block edges between
  // them, keeping the map monotonic in both panes.
  function blend(
    before: ScrollAnchor,
    after: ScrollAnchor,
    position: number,
    from: Pane,
  ) {
    const points = [before];
    for (const point of [...anchors, after]) {
      const last = points[points.length - 1];
      if (
        point.editor > last.editor &&
        point.editor <= after.editor &&
        point.preview > last.preview &&
        point.preview <= after.preview
      )
        points.push({ editor: point.editor, preview: point.preview });
    }
    if (points.length === 1) points.push(after);
    return mapScroll(points, position, from);
  }
  // Without a letter on one side, blend from the start or toward the end of
  // both panes, so a leading or trailing diagram does not cause a jump.
  function edges(
    before: ScrollAnchor | null,
    after: ScrollAnchor | null,
  ): [ScrollAnchor, ScrollAnchor] | null {
    if (!before && !after) return null;
    if (!after)
      return [
        before!,
        { editor: editor.scrollHeight, preview: preview.scrollHeight },
      ];
    if (!before) return [{ editor: 0, preview: 0 }, after];
    // Out-of-order letters (e.g. footnotes) keep the nearer one aligned.
    return after.editor > before.editor && after.preview > before.preview
      ? [before, after]
      : null;
  }
  // Editor scroll for the letters around the preview's reference row.
  function blendedEditorScroll(bounds: DOMRect) {
    const list = textBoxes();
    if (!list.length) return null;
    const offset = referenceOffset(preview);
    const reference = preview.scrollTop + offset;
    // Last range starting at or above the reference row.
    let low = 0,
      high = list.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (list[middle].top <= reference) low = middle;
      else high = middle - 1;
    }
    const letter = (
      box: (typeof list)[number] | undefined,
      index: number | 'last',
    ) => {
      if (!box) return null;
      const glyph = previewLetter(
        view,
        preview,
        box.range,
        index === 'last' ? box.range.text.length - 1 : index,
      );
      return glyph
        ? {
            position: glyph.position,
            bottom: glyph.bottom,
            preview: glyph.top,
            editor: editorTop(glyph.position) - bounds.top + editor.scrollTop,
          }
        : null;
    };
    const current = list[low];
    let before: ReturnType<typeof letter> = null,
      after: ReturnType<typeof letter> = null;
    if (current.top <= reference && reference < current.bottom) {
      const row = letter(
        current,
        previewLetterIndex(preview, current.range, reference),
      );
      if (row && row.preview <= reference) {
        before = row;
        const next = previewLetterIndex(preview, current.range, row.bottom);
        const candidate = letter(current, next);
        after =
          candidate && candidate.preview >= row.bottom
            ? candidate
            : letter(list[low + 1], 0);
      } else after = row;
    } else if (current.top <= reference) {
      before = letter(current, 'last');
      after = letter(list[low + 1], 0);
    } else after = letter(current, 0);
    const real = before ?? after;
    if (!real) return null;
    lastSourcePosition = real.position;
    const pair = edges(before, after);
    return pair
      ? blend(...pair, reference, 'preview') - offset
      : real.editor - (real.preview - preview.scrollTop);
  }
  function measure() {
    ranges = null;
    boxes = null;
    const previewTop = preview.getBoundingClientRect().top;
    const editorPadding =
      view.documentTop - editor.getBoundingClientRect().top + editor.scrollTop;
    const points: ScrollAnchor[] = [{ editor: 0, preview: 0 }];
    for (const element of preview.querySelectorAll<HTMLElement>(
      '[data-source-start]',
    )) {
      const line = Number(element.dataset.sourceLine),
        endLine = Number(element.dataset.sourceEndLine);
      if (
        !Number.isInteger(line) ||
        !Number.isInteger(endLine) ||
        line < 1 ||
        endLine > view.state.doc.lines
      )
        continue;
      const start =
          view.state.doc.line(line).from +
          Number(element.dataset.sourceColumn) -
          1,
        end =
          view.state.doc.line(endLine).from +
          Number(element.dataset.sourceEndColumn) -
          1;
      if (!Number.isFinite(start) || start < 0 || start > view.state.doc.length)
        continue;
      const rect = element.getBoundingClientRect();
      points.push({
        editor: editorPadding + view.lineBlockAt(start).top,
        preview: rect.top - previewTop + preview.scrollTop,
      });
      if (end > start && end <= view.state.doc.length)
        points.push({
          editor: editorPadding + view.lineBlockAt(end - 1).bottom,
          preview: rect.bottom - previewTop + preview.scrollTop,
        });
    }
    points.sort((a, b) => a.editor - b.editor || a.preview - b.preview);
    // Nested blocks can share a source line; keep a monotonic map for both directions.
    anchors = [];
    for (const point of points) {
      const previous = anchors.at(-1);
      if (
        !previous ||
        (point.editor > previous.editor && point.preview > previous.preview)
      )
        anchors.push(point);
    }
    dirty = false;
  }
  function sync() {
    frame = 0;
    if (
      !enabled ||
      !isPreviewCurrent() ||
      !editor.clientHeight ||
      !preview.clientHeight ||
      !preview.clientWidth
    )
      return;
    if (dirty) measure();
    const source = owner === 'editor' ? editor : preview,
      target = owner === 'editor' ? preview : editor,
      to = owner === 'editor' ? 'preview' : 'editor';
    const maximum = source.scrollHeight - source.clientHeight;
    const editorBounds = editor.getBoundingClientRect();
    const trackingCursor = owner === 'editor' && followCursor && view.hasFocus;
    // Without a preview glyph (e.g. a new blank line), keep the current visual
    // anchor, including editor auto-scroll, until text can be mapped again.
    let value = trackingCursor
      ? preview.scrollTop + editor.scrollTop - lastEditorTop
      : mapScroll(anchors, source.scrollTop, owner);
    const referenceY = editorBounds.top + referenceOffset(editor);
    if (owner === 'editor' && !trackingCursor) {
      const blended = blendedScroll(
        referenceY,
        editorBounds,
        Math.max(
          editorBounds.left + 1,
          view.contentDOM.getBoundingClientRect().left + 13,
        ),
      );
      if (blended !== null) value = blended;
    } else if (owner === 'editor') {
      const position = view.state.selection.main.head;
      {
        // coordsAtPos measures a visual row, including soft wrapping.
        // https://codemirror.net/docs/ref/#view.EditorView.coordsAtPos
        const caretPoint = previewAtSource(
          view,
          preview,
          position,
          undefined,
          textRanges(),
        );
        // Re-measure the last visible source anchor after an image, formula or
        // diagram changes height. Pixel deltas alone cannot follow that reflow.
        const point =
          caretPoint ??
          (lastSourcePosition !== null
            ? previewAtSource(
                view,
                preview,
                lastSourcePosition,
                undefined,
                textRanges(),
              )
            : null);
        // Measure the source glyph that produced the preview anchor. A caret
        // at the end of a table cell can already sit on the next soft-wrapped
        // row while its last rendered letter is still on the previous one.
        // URLs and Markdown delimiters likewise have no preview glyph.
        const cursor = view.coordsAtPos(point?.position ?? position);
        if (
          cursor &&
          point &&
          cursor.bottom > editorBounds.top &&
          cursor.top < editorBounds.bottom
        ) {
          value = point.y - (cursor.top - editorBounds.top);
          lastSourcePosition = point.position;
        }
      }
    } else {
      const blended = blendedEditorScroll(editorBounds);
      if (blended !== null) value = blended;
    }
    if (!trackingCursor && source.scrollTop < 1) value = 0;
    else if (!trackingCursor && maximum > 0 && source.scrollTop >= maximum - 1)
      value = target.scrollHeight - target.clientHeight;
    value = Math.max(
      0,
      Math.min(target.scrollHeight - target.clientHeight, value),
    );
    if (Math.abs(target.scrollTop - value) > 0.5) {
      expected[to] = value;
      target.scrollTop = value;
    }
    lastEditorTop = editor.scrollTop;
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };
  function listen(pane: Pane, element: HTMLElement) {
    const scroll = () => {
      if (
        expected[pane] !== undefined &&
        Math.abs(element.scrollTop - expected[pane]!) < 1
      ) {
        delete expected[pane];
        return;
      }
      delete expected[pane];
      // A scroll event alone can come from layout/scroll anchoring, including
      // delayed events from our own writes. Only interaction changes ownership;
      // otherwise a preview reflow can pull the editor away from its caret.
      schedule();
    };
    const interact = (event: Event) => {
      delete expected[pane];
      owner = pane;
      if (event.type !== 'keydown') followCursor = false;
    };
    element.addEventListener('scroll', scroll, { passive: true });
    for (const event of ['wheel', 'pointerdown', 'touchstart', 'keydown'])
      element.addEventListener(event, interact, { passive: true });
    return () => {
      element.removeEventListener('scroll', scroll);
      for (const event of ['wheel', 'pointerdown', 'touchstart', 'keydown'])
        element.removeEventListener(event, interact);
    };
  }
  const stopEditor = listen('editor', editor),
    stopPreview = listen('preview', preview);
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          dirty = true;
          schedule();
        });
  observer?.observe(editor);
  observer?.observe(preview);
  if (preview.firstElementChild) observer?.observe(preview.firstElementChild);
  return {
    refresh(active = true, { beforePaint = false } = {}) {
      if (enabled !== active) lastEditorTop = editor.scrollTop;
      enabled = active;
      dirty = true;
      if (beforePaint) {
        // Called from the committed deferred preview's layout effect. Ordinary
        // CodeMirror updates stay frame-scheduled, outside the editor update.
        cancelAnimationFrame(frame);
        sync();
      } else schedule();
    },
    // App-driven preview jumps have no pointer event to claim the scroll.
    previewNavigated() {
      delete expected.preview;
      owner = 'preview';
      followCursor = false;
    },
    editorChanged(selectionChanged = false, changes?: ChangeDesc) {
      dirty = true;
      if (lastSourcePosition !== null && changes)
        lastSourcePosition = changes.mapPos(
          lastSourcePosition,
          1,
          MapMode.TrackDel,
        );
      if (selectionChanged && view.hasFocus) {
        owner = 'editor';
        followCursor = true;
      }
      schedule();
    },
    destroy() {
      stopEditor();
      stopPreview();
      observer?.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
