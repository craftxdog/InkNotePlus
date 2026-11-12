// @vitest-environment jsdom
import { ChangeSet, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it, vi } from 'vitest';
import { createScrollSync } from '../../src/renderer/editor/scroll-sync';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createPanes(kind: 'code' | 'formula' = 'code') {
  const rows = Array.from({ length: 40 }, () => '');
  const mappedLines = [1, 5, 12, 16, 20, 24, 28, 32, 36, 40];
  for (const line of mappedLines)
    rows[line - 1] = `Reference paragraph ${line}`;
  rows[2] = `![photo](inknote-asset://images/${'a'.repeat(64)}.png)`;
  rows[6] = kind === 'code' ? '```ts' : '$$';
  rows[7] = kind === 'code' ? 'const value = 1;' : 'a^2 + b^2 = c^2';
  rows[8] = kind === 'code' ? 'value + 1;' : String.raw`\frac{1}{2}`;
  rows[9] = kind === 'code' ? '```' : '$$';
  const host = document.createElement('div');
  const preview = document.createElement('aside');
  const content = document.createElement('div');
  preview.append(content);
  document.body.append(host, preview);
  const view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: rows.join('\n') }),
  });
  const editor = view.scrollDOM;
  const paneTop = 80;
  const height = 300;
  const lineHeight = 25;
  let growth = 0;
  let current = true;
  let notifyResize = () => {};

  // Only layout and animation/resize delivery are faked. Every measurement is
  // relative to the pane's current scrollTop and finite scrollable content.
  Object.defineProperties(editor, {
    clientHeight: { get: () => height },
    scrollHeight: { get: () => view.state.doc.lines * lineHeight },
  });
  Object.defineProperties(preview, {
    clientHeight: { get: () => height },
    clientWidth: { get: () => 400 },
    scrollHeight: { get: () => 2000 + growth },
  });
  vi.spyOn(editor, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, paneTop, 400, height),
  );
  vi.spyOn(preview, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(500, paneTop, 400, height),
  );
  vi.spyOn(view.contentDOM, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, paneTop - editor.scrollTop, 400, editor.scrollHeight),
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
  vi.spyOn(view, 'posAtCoords').mockImplementation(({ y }) => {
    const line = Math.floor((y - paneTop + editor.scrollTop) / lineHeight) + 1;
    return view.state.doc.line(Math.max(1, Math.min(rows.length, line))).from;
  });

  const spans = new Map<number, HTMLElement>();
  function block(
    line: number,
    endLine: number,
    top: number,
    blockHeight: number,
  ) {
    const element = document.createElement('div');
    Object.assign(element.dataset, {
      sourceStart: String(view.state.doc.line(line).from),
      sourceLine: String(line),
      sourceEndLine: String(endLine),
      sourceColumn: '1',
      sourceEndColumn: String(view.state.doc.line(endLine).length + 1),
    });
    const bounds = () =>
      new DOMRect(
        500,
        paneTop + top + (line > 3 ? growth : 0) - preview.scrollTop,
        300,
        blockHeight + (line === 3 ? growth : 0),
      );
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(bounds);
    content.append(element);
    return { element, bounds };
  }
  const tops = [0, 300, 550, 700, 850, 1000, 1150, 1300, 1450, 1600];
  for (const [index, line] of mappedLines.entries()) {
    const { element, bounds } = block(line, line, tops[index], 24);
    const span = document.createElement('span');
    Object.assign(span.dataset, {
      sourceTextLine: String(line),
      sourceTextEndLine: String(line),
      sourceTextColumn: '1',
      sourceTextEndColumn: String(view.state.doc.line(line).length + 1),
    });
    span.textContent = view.state.doc.line(line).text;
    element.append(span);
    vi.spyOn(span, 'getBoundingClientRect').mockImplementation(bounds);
    spans.set(line, span);
  }
  block(3, 3, 50, 180).element.textContent = '[photo]';
  block(7, 10, 370, 125).element.textContent = rows.slice(7, 9).join('\n');
  content.replaceChildren(
    ...Array.from(content.children).sort(
      (left, right) =>
        Number((left as HTMLElement).dataset.sourceLine) -
        Number((right as HTMLElement).dataset.sourceLine),
    ),
  );
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = createRange();
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () =>
        range.startContainer.parentElement?.getBoundingClientRect() ??
        new DOMRect(),
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notifyResize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const sync = createScrollSync(view, preview, () => current);
  const flushFrame = () => {
    const pending = new Map(frames);
    for (const [id, callback] of pending) {
      frames.delete(id);
      callback(0);
    }
  };
  const selectLine = (line: number) => {
    view.dispatch({ selection: { anchor: view.state.doc.line(line).to } });
    sync.editorChanged(true);
  };
  const positions = (line = 5) => ({
    editor: view.coordsAtPos(view.state.doc.line(line).from)!.top - paneTop,
    preview: spans.get(line)!.getBoundingClientRect().top - paneTop,
  });
  const scroll = (pane: HTMLElement, top: number, wheel = false) => {
    if (wheel)
      pane.dispatchEvent(
        new WheelEvent('wheel', { deltaY: top - pane.scrollTop }),
      );
    pane.scrollTop = top;
    pane.dispatchEvent(new Event('scroll'));
  };
  return {
    view,
    editor,
    preview,
    sync,
    flushFrame,
    selectLine,
    positions,
    scroll,
    setCurrent(value: boolean) {
      current = value;
    },
    growPreview(value: number) {
      growth += value;
      notifyResize();
    },
    destroy() {
      sync.destroy();
      view.destroy();
      host.remove();
      preview.remove();
    },
  };
}

it.each(['code', 'formula'] as const)(
  'keeps the existing paragraph aligned while editing unmapped %s and applies each editor movement once',
  (kind) => {
    const panes = createPanes(kind);
    try {
      panes.selectLine(5);
      panes.flushFrame();
      expect(panes.positions()).toEqual({ editor: 100, preview: 100 });
      panes.selectLine(8);
      panes.flushFrame();
      expect(panes.positions()).toEqual({ editor: 100, preview: 100 });

      const from = panes.view.state.selection.main.head;
      panes.view.dispatch({
        changes: { from, insert: 'x' },
        selection: { anchor: from + 1 },
      });
      panes.sync.editorChanged(true);
      panes.scroll(panes.editor, 25);
      panes.flushFrame();
      expect(panes.positions()).toEqual({ editor: 75, preview: 75 });
      for (let index = 0; index < 3; index++) {
        panes.sync.editorChanged();
        panes.sync.refresh();
        panes.flushFrame();
        expect(panes.positions()).toEqual({ editor: 75, preview: 75 });
      }
    } finally {
      panes.destroy();
    }
  },
);

it.each(['insert', 'delete'] as const)(
  'maps the cached source anchor through an %s before it while editing code',
  (operation) => {
    const panes = createPanes();
    try {
      panes.selectLine(5);
      panes.flushFrame();
      panes.selectLine(8);
      panes.flushFrame();
      const changes = ChangeSet.of(
        operation === 'insert'
          ? { from: 0, insert: 'Earlier text '.repeat(10) }
          : { from: 0, to: panes.view.state.doc.line(1).to },
        panes.view.state.doc.length,
      );
      panes.view.dispatch({ changes });
      panes.sync.editorChanged(true, changes.desc);
      panes.growPreview(80);
      panes.flushFrame();
      expect(panes.positions()).toEqual({ editor: 100, preview: 100 });
      panes.sync.refresh();
      panes.flushFrame();
      expect(panes.positions()).toEqual({ editor: 100, preview: 100 });
    } finally {
      panes.destroy();
    }
  },
);

it('forgets a deleted source anchor instead of following replacement content', () => {
  const panes = createPanes();
  try {
    panes.selectLine(5);
    panes.flushFrame();
    panes.selectLine(8);
    panes.flushFrame();
    const line = panes.view.state.doc.line(5);
    const changes = ChangeSet.of(
      {
        from: line.from,
        to: line.to,
        insert: 'Unrelated replacement paragraph',
      },
      panes.view.state.doc.length,
    );
    panes.view.dispatch({ changes });
    panes.sync.editorChanged(true, changes.desc);
    const replacement = panes.preview.querySelector(
      '[data-source-text-line="5"]',
    ) as HTMLElement;
    replacement.textContent = 'Unrelated replacement paragraph';
    replacement.dataset.sourceTextEndColumn = String(
      replacement.textContent.length + 1,
    );
    panes.growPreview(80);
    panes.flushFrame();
    expect(panes.preview.scrollTop).toBe(200);
    panes.scroll(panes.editor, 25);
    panes.flushFrame();
    expect(panes.preview.scrollTop).toBe(225);
    panes.selectLine(12);
    panes.flushFrame();
    expect(panes.positions(12).preview).toBe(panes.positions(12).editor);
  } finally {
    panes.destroy();
  }
});

it('keeps an anchor already preserved by browser scroll anchoring when an earlier block grows', () => {
  const panes = createPanes();
  try {
    panes.selectLine(5);
    panes.flushFrame();
    panes.selectLine(8);
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 100, preview: 100 });

    panes.growPreview(80);
    // Native scroll anchoring can precede ResizeObserver's animation frame.
    panes.preview.scrollTop += 80;
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 100, preview: 100 });
    panes.preview.dispatchEvent(new Event('scroll'));
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 100, preview: 100 });
  } finally {
    panes.destroy();
  }
});

it('follows the user pane across preview wheel, unmapped editing, and editor wheel', () => {
  const panes = createPanes();
  try {
    panes.selectLine(5);
    panes.flushFrame();
    panes.selectLine(8);
    panes.flushFrame();

    panes.scroll(panes.preview, 400, true);
    panes.flushFrame();
    expect(panes.positions(12)).toEqual({ editor: 150, preview: 150 });
    // Deliver the browser scroll event caused by the controller assignment.
    panes.editor.dispatchEvent(new Event('scroll'));
    panes.selectLine(8);
    panes.flushFrame();
    expect(panes.positions(12)).toEqual({ editor: 150, preview: 150 });

    panes.scroll(panes.editor, 100, true);
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 0, preview: 0 });
    panes.preview.dispatchEvent(new Event('scroll'));
    panes.sync.refresh();
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 0, preview: 0 });
  } finally {
    panes.destroy();
  }
});

it('accumulates editor movement during a deferred preview without applying it twice when rendering resumes', () => {
  const panes = createPanes();
  try {
    panes.selectLine(5);
    panes.flushFrame();
    panes.selectLine(8);
    panes.flushFrame();
    panes.setCurrent(false);
    for (const top of [25, 50]) {
      panes.scroll(panes.editor, top);
      panes.sync.editorChanged(true);
      panes.flushFrame();
      expect(panes.preview.scrollTop).toBe(200);
    }

    panes.setCurrent(true);
    panes.sync.refresh();
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 50, preview: 50 });
    panes.sync.refresh();
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 50, preview: 50 });
  } finally {
    panes.destroy();
  }
});

it('resumes synchronized unmapped editing without replaying movement from the disabled interval', () => {
  const panes = createPanes();
  try {
    panes.selectLine(5);
    panes.flushFrame();
    panes.selectLine(8);
    panes.flushFrame();
    panes.sync.refresh(false);
    panes.flushFrame();

    // Both panes may move independently while disabled. Reenable with an
    // existing shared paragraph already aligned in their new positions.
    panes.scroll(panes.editor, 25);
    panes.scroll(panes.preview, 225);
    panes.selectLine(8);
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 75, preview: 75 });
    panes.sync.refresh(true);
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 75, preview: 75 });
    panes.scroll(panes.editor, 50);
    panes.flushFrame();
    expect(panes.positions()).toEqual({ editor: 50, preview: 50 });
  } finally {
    panes.destroy();
  }
});

it.each(['code', 'formula'] as const)(
  'keeps an existing paragraph aligned when an earlier preview block grows while the cursor is inside unmapped %s',
  (kind) => {
    const panes = createPanes(kind);
    try {
      panes.selectLine(5);
      panes.flushFrame();
      panes.selectLine(8);
      panes.flushFrame();
      expect(panes.positions()).toEqual({ editor: 100, preview: 100 });

      // A deferred render/image adds height above the existing paragraph.
      // Its source line stays at exactly the same visible editor position.
      panes.growPreview(80);
      panes.flushFrame();
      expect(panes.positions()).toEqual({ editor: 100, preview: 100 });
      panes.sync.refresh();
      panes.flushFrame();
      expect(panes.positions()).toEqual({ editor: 100, preview: 100 });
    } finally {
      panes.destroy();
    }
  },
);
