import type { EditorView } from '@codemirror/view';
import { MapMode, type ChangeDesc } from '@codemirror/state';
import { previewAtSource, sourceAtPreview } from './preview-source-position';

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
  function measure() {
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
    if (owner === 'editor') {
      const referenceY = editorBounds.top + editor.clientHeight * 0.35;
      const position = trackingCursor
        ? view.state.selection.main.head
        : view.posAtCoords(
            {
              x: Math.max(
                editorBounds.left + 1,
                view.contentDOM.getBoundingClientRect().left + 13,
              ),
              y: referenceY,
            },
            false,
          );
      if (position !== null) {
        // coordsAtPos measures a visual row, including soft wrapping.
        // https://codemirror.net/docs/ref/#view.EditorView.coordsAtPos
        const caretPoint = previewAtSource(
          view,
          preview,
          position,
          trackingCursor ? undefined : referenceY,
        );
        // Re-measure the last visible source anchor after an image, formula or
        // diagram changes height. Pixel deltas alone cannot follow that reflow.
        const point =
          caretPoint ??
          (trackingCursor && lastSourcePosition !== null
            ? previewAtSource(view, preview, lastSourcePosition)
            : null);
        // Link URLs and delimiters have no preview glyph. While scrolling,
        // measure the source glyph that actually produced the preview anchor.
        const cursor = view.coordsAtPos(
          point && (!trackingCursor || !caretPoint) ? point.position : position,
        );
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
      const point = sourceAtPreview(view, preview);
      if (point) {
        lastSourcePosition = point.position;
        const coordinates = view.coordsAtPos(point.position);
        const block = view.lineBlockAt(point.position);
        const padding = view.documentTop - editorBounds.top + editor.scrollTop;
        // An offscreen, virtualized row is first estimated. CodeMirror's viewport
        // update schedules a second pass with its measured character coordinates.
        const editorY = coordinates
          ? coordinates.top - editorBounds.top + editor.scrollTop
          : padding +
            block.top +
            (block.height * (point.position - block.from)) /
              Math.max(1, block.to - block.from);
        value = editorY - point.y;
      }
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
      owner = pane;
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
    refresh(active = true) {
      if (enabled !== active) lastEditorTop = editor.scrollTop;
      enabled = active;
      dirty = true;
      schedule();
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
