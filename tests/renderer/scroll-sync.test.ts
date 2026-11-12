// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it, vi } from 'vitest';
import { createScrollSync } from '../../src/renderer/editor/scroll-sync';

afterEach(() => vi.restoreAllMocks());

function createPanes(height: number, isPreviewCurrent = () => true) {
  const paragraphs = Array.from(
    { length: 6 },
    (_, index) => `Paragraph ${index + 1}`,
  );
  const source = paragraphs.join('\n\n');
  const host = document.createElement('div');
  const preview = document.createElement('aside');
  document.body.append(host, preview);
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: source,
      selection: { anchor: source.length },
    }),
  });
  const editor = view.scrollDOM;
  const paneTop = 80;
  const lineHeight = 25;
  const previewStep = 72;

  // jsdom has no layout. Keep both panes within finite scroll ranges, with
  // taller rendered paragraphs and 28px below the final preview glyph.
  Object.defineProperties(editor, {
    clientHeight: { get: () => height },
    scrollHeight: {
      get: () => Math.max(height, view.state.doc.lines * lineHeight),
    },
  });
  Object.defineProperties(preview, {
    clientHeight: { get: () => height },
    clientWidth: { get: () => 400 },
    scrollHeight: {
      get: () => (paragraphs.length - 1) * previewStep + 24 + 28,
    },
  });
  vi.spyOn(editor, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, paneTop, 400, height),
  );
  vi.spyOn(preview, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(500, paneTop, 400, height),
  );
  vi.spyOn(view.contentDOM, 'getBoundingClientRect').mockImplementation(
    () =>
      new DOMRect(
        0,
        paneTop - editor.scrollTop,
        400,
        view.state.doc.lines * lineHeight,
      ),
  );
  vi.spyOn(view, 'coordsAtPos').mockImplementation((position) => {
    const line = view.state.doc.lineAt(position);
    const top = paneTop + (line.number - 1) * lineHeight - editor.scrollTop;
    return { left: 0, right: 8, top, bottom: top + lineHeight };
  });
  vi.spyOn(view, 'lineBlockAt').mockImplementation((position) => {
    const line = view.state.doc.lineAt(position);
    const top = (line.number - 1) * lineHeight;
    return {
      from: line.from,
      to: line.to,
      length: line.length,
      top,
      bottom: top + lineHeight,
      height: lineHeight,
      type: 0,
      widget: null,
      widgetLineBreaks: 0,
    };
  });

  const spans = paragraphs.map((text, index) => {
    const paragraph = document.createElement('p');
    const span = document.createElement('span');
    const line = index * 2 + 1;
    Object.assign(paragraph.dataset, {
      sourceStart: String(view.state.doc.line(line).from),
      sourceLine: String(line),
      sourceEndLine: String(line),
      sourceColumn: '1',
      sourceEndColumn: String(text.length + 1),
    });
    Object.assign(span.dataset, {
      sourceTextLine: String(line),
      sourceTextEndLine: String(line),
      sourceTextColumn: '1',
      sourceTextEndColumn: String(text.length + 1),
    });
    span.textContent = text;
    paragraph.append(span);
    preview.append(paragraph);
    const bounds = () =>
      new DOMRect(
        500,
        paneTop + index * previewStep - preview.scrollTop,
        100,
        24,
      );
    vi.spyOn(paragraph, 'getBoundingClientRect').mockImplementation(bounds);
    vi.spyOn(span, 'getBoundingClientRect').mockImplementation(bounds);
    return span;
  });

  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = createRange();
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => {
        const span = range.startContainer.parentElement;
        return span && spans.includes(span)
          ? span.getBoundingClientRect()
          : new DOMRect();
      },
    });
    return range;
  });
  view.focus();

  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
    (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
  );
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) =>
    frames.delete(id),
  );
  const sync = createScrollSync(view, preview, isPreviewCurrent);
  const flushFrame = () => {
    const pendingFrames = new Map(frames);
    for (const [id, callback] of pendingFrames) {
      frames.delete(id);
      callback(0);
    }
  };
  const lastSpan = spans.at(-1)!;
  const lastTextStart = view.state.doc.line(11).from;
  const visiblePositions = () => ({
    editor:
      view.coordsAtPos(lastTextStart)!.top - editor.getBoundingClientRect().top,
    preview:
      lastSpan.getBoundingClientRect().top -
      preview.getBoundingClientRect().top,
  });
  const type = (text: string) => {
    const from = view.state.selection.main.head;
    view.dispatch({
      changes: { from, insert: text },
      selection: { anchor: from + text.length },
    });
    sync.editorChanged(true);
  };
  const renderTypedCharacter = () => {
    lastSpan.textContent += '!';
    const column = String(lastSpan.textContent!.length + 1);
    lastSpan.dataset.sourceTextEndColumn = column;
    lastSpan.parentElement!.dataset.sourceEndColumn = column;
    sync.refresh();
  };
  return {
    view,
    editor,
    preview,
    sync,
    flushFrame,
    visiblePositions,
    type,
    renderTypedCharacter,
    destroy() {
      sync.destroy();
      view.destroy();
      host.remove();
      preview.remove();
    },
  };
}

it('keeps visible text aligned when Enter moves the cursor to an unrendered final blank line without scrolling the editor', () => {
  const panes = createPanes(300);
  try {
    expect(panes.view.hasFocus).toBe(true);
    panes.type('!');
    panes.renderTypedCharacter();
    panes.flushFrame();
    const aligned = panes.visiblePositions();
    const alignedScroll = panes.preview.scrollTop;
    expect(aligned.preview).toBe(aligned.editor);
    expect(alignedScroll).toBeGreaterThan(0);
    expect(panes.editor.scrollTop).toBe(0);

    panes.editor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    panes.type('\n');
    panes.sync.refresh();
    panes.flushFrame();

    expect(
      panes.view.state.doc.lineAt(panes.view.state.selection.main.head).text,
    ).toBe('');
    expect(panes.editor.scrollTop).toBe(0);
    expect(panes.visiblePositions()).toEqual(aligned);
    expect(panes.preview.scrollTop).toBe(alignedScroll);
  } finally {
    panes.destroy();
  }
});

it('keeps rendered text aligned when Enter scrolls the editor to reveal an unrendered final blank line', () => {
  const panes = createPanes(275);
  try {
    panes.type('!');
    panes.renderTypedCharacter();
    panes.flushFrame();
    const before = panes.visiblePositions();
    expect(before.preview).toBe(before.editor);
    expect(panes.preview.scrollTop).toBeGreaterThan(0);

    panes.editor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    panes.type('\n');
    panes.editor.scrollTop = 25;
    panes.editor.dispatchEvent(new Event('scroll'));
    panes.sync.refresh();
    panes.flushFrame();

    const after = panes.visiblePositions();
    expect(after.editor).toBe(before.editor - 25);
    expect(after.preview).toBe(after.editor);
  } finally {
    panes.destroy();
  }
});

it('keeps the anchor through a deferred preview and applies editor auto-scroll only once', () => {
  let current = true;
  const panes = createPanes(275, () => current);
  try {
    panes.type('!');
    panes.renderTypedCharacter();
    panes.flushFrame();
    const alignedScroll = panes.preview.scrollTop;

    current = false;
    panes.type('\n');
    panes.editor.scrollTop = 25;
    panes.editor.dispatchEvent(new Event('scroll'));
    panes.flushFrame();
    expect(panes.preview.scrollTop).toBe(alignedScroll);

    current = true;
    panes.sync.refresh();
    panes.flushFrame();
    expect(panes.visiblePositions()).toEqual({ editor: 225, preview: 225 });

    for (let index = 0; index < 3; index++) {
      panes.sync.editorChanged();
      panes.sync.refresh();
      panes.flushFrame();
      expect(panes.visiblePositions()).toEqual({ editor: 225, preview: 225 });
    }
  } finally {
    panes.destroy();
  }
});
