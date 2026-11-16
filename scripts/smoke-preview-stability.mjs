import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';

function watchFrames(marker) {
  const editor = document.querySelector('.cm-scroller');
  const preview = document.querySelector('.pane--preview');
  const view = document.querySelector('.cm-editor');
  const frames = [];
  const diagrams = [...preview.querySelectorAll('.mermaid-dot-grid > svg')];
  let stopped = false;
  let loading = 0;
  let svgRemovals = 0;
  const observer = new MutationObserver((records) => {
    if (
      document.querySelector('.list-status')?.textContent.includes('Cargando')
    )
      loading++;
    for (const record of records)
      for (const node of record.removedNodes)
        if (node instanceof Element)
          svgRemovals += diagrams.filter(
            (svg) => node === svg || node.contains(svg),
          ).length;
  });
  observer.observe(document.querySelector('.inknote-shell'), {
    childList: true,
    subtree: true,
  });
  function glyph(root, needle) {
    if (!root) return null;
    const offset = root.textContent.indexOf(needle) + needle.length - 1;
    if (offset < needle.length - 1) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let consumed = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (offset < consumed + node.length) {
        const range = document.createRange();
        range.setStart(node, offset - consumed);
        range.setEnd(node, offset - consumed + 1);
        return range.getBoundingClientRect();
      }
      consumed += node.length;
    }
    return null;
  }
  function tick(time) {
    if (stopped) return;
    const source = [...document.querySelectorAll('.cm-line')].find((line) =>
      line.textContent.includes(marker),
    );
    const needle = source?.textContent.match(
      new RegExp(`${marker}[a-z]*`),
    )?.[0];
    const target =
      needle &&
      [...preview.querySelectorAll('[data-source-text-line]')].find((span) =>
        span.textContent.includes(needle),
      );
    const a = needle && glyph(source, needle),
      b = target && glyph(target, needle);
    frames.push({
      time,
      source: needle,
      current: !!b,
      editorTop: editor.scrollTop,
      previewTop: preview.scrollTop,
      delta:
        a && b
          ? a.top -
            editor.getBoundingClientRect().top -
            (b.top - preview.getBoundingClientRect().top)
          : null,
      editorPresent: view.isConnected,
      saving: document.querySelector('.editor-save-state')?.textContent,
      sourceY: a?.top,
      previewY: b?.top,
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.stopPreviewWatch = () => {
    stopped = true;
    observer.disconnect();
    return { marker, frames, loading, svgRemovals };
  };
}

async function selectNote(page, title) {
  await page.waitForFunction(
    (title) =>
      [...document.querySelectorAll('.note-row-title')].some(
        (element) => element.textContent === title,
      ),
    {},
    title,
  );
  await page.$$eval(
    '.note-list-item',
    (elements, title) =>
      elements
        .find(
          (element) =>
            element.querySelector('.note-row-title').textContent === title,
        )
        .click(),
    title,
  );
  await page.waitForFunction(
    (title) => document.querySelector('.document-title-input')?.value === title,
    {},
    title,
  );
  await page.waitForFunction(
    () => document.querySelectorAll('.mermaid-dot-grid > svg').length === 2,
  );
  await page.evaluate(() => document.fonts.ready);
}

export async function verifyPreviewStability({ page, profile }) {
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  assert(original.ok);
  const viewport = page.viewport();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const body = [
    '# Preview stability',
    ...Array.from(
      { length: 12 },
      (_, i) =>
        `## Section ${i}\nA paragraph with **formatting** and a [link](https://example.invalid/long/path).`,
    ),
    '```mermaid\nflowchart TD\n A[Start] --> B{Ready?}\n B -->|Yes| C[Done]\n B -->|No| A\n```',
    '```mermaid\nerDiagram\n CUSTOMER ||--o{ ORDER : places\n ORDER ||--|{ ITEM : contains\n```',
    'AfterDiagramAnchor',
    '## Table',
    '| ID | Description | Value |\n| --- | --- | --- |\n| 1 | StableTypingAnchor | value |\n| 2 | Another row | result |',
    ...Array.from(
      { length: 18 },
      (_, i) =>
        `## Later ${i}\nA later paragraph leaves room for scrolling and wrapping.`,
    ),
  ].join('\n\n');
  const reports = [];
  const letters = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz';
  async function typeAndMeasure(noteId, marker, mode) {
    const before = await page.evaluate(
      (id) => window.inkNote.notes.list({ id }),
      noteId,
    );
    assert(before.ok && before.data.length === 1);
    const text = before.data[0].body.replace(/\r\n?/g, '\n');
    const needle = text.match(new RegExp(`${marker}[a-z]*`))?.[0];
    assert(needle);
    await page.focus('.cm-content');
    await page.keyboard.down(modifier);
    await page.keyboard.press('f');
    await page.keyboard.up(modifier);
    await page.waitForSelector('.cm-search input[name="search"]');
    await page.focus('.cm-search input[name="search"]');
    await page.keyboard.down(modifier);
    await page.keyboard.press('a');
    await page.keyboard.up(modifier);
    await page.keyboard.type(needle);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      (needle) => document.getSelection()?.toString() === needle,
      {},
      needle,
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() =>
      document.activeElement?.classList.contains('cm-content'),
    );
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 250)),
    );
    const caretLine = await page.evaluate(
      () =>
        document.getSelection()?.focusNode?.parentElement.closest('.cm-line')
          ?.textContent,
    );
    assert(
      caretLine?.includes(needle),
      'Type at the fixture selected by CodeMirror search.',
    );
    await page.evaluate(watchFrames, marker);
    await page.keyboard.type(letters, { delay: 55 });
    await page.waitForFunction(
      () =>
        document.querySelector('.editor-save-state')?.textContent ===
        'Guardado localmente',
    );
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
    );
    reports.push({
      ...(await page.evaluate(() => window.stopPreviewWatch())),
      mode,
    });
    const saved = await page.evaluate(
      (id) => window.inkNote.notes.list({ id }),
      noteId,
    );
    assert(saved.ok);
    assert.equal(
      saved.data[0].body,
      text.replace(needle, needle + letters),
      'Autosave preserves every typed character.',
    );
    await page.screenshot({
      path: path.join(profile, `preview-stability-${mode}-${marker}.png`),
    });
  }
  try {
    await page.setViewport({ width: 1600, height: 1100 });
    const ready = await page.evaluate(async (body) => {
      const settings = await window.inkNote.preferences.update({
        theme: 'inknote-dark',
        editorMode: 'split',
        keyboardMode: 'standard',
        lineWrapping: 'all',
        editorFontSize: 14,
        editorLineHeight: 1.6,
        previewFontSize: 17,
        previewLineHeight: 1.5,
        syncScroll: true,
        noteSort: 'title',
      });
      const note = await window.inkNote.notes.create({
        title: 'Preview stability',
        body,
      });
      return { settings, note };
    }, body);
    assert(ready.settings.ok && ready.note.ok);
    for (const mode of ['all', 'cursor', 'prose', 'off']) {
      assert(
        (
          await page.evaluate(
            (lineWrapping) =>
              window.inkNote.preferences.update({ lineWrapping }),
            mode,
          )
        ).ok,
      );
      await page.reload({ waitUntil: 'networkidle0' });
      await selectNote(page, 'Preview stability');
      for (const marker of ['StableTypingAnchor', 'AfterDiagramAnchor'])
        await typeAndMeasure(ready.note.data.id, marker, mode);
    }
    // The second note has identical CRLF Markdown. React can reuse its preview;
    // the new CodeMirror instance must still bind to that rendered document.
    const twins = await page.evaluate(async (id) => {
      const source = await window.inkNote.notes.list({ id });
      if (!source.ok) throw new Error('Cannot read the source fixture.');
      const body = source.data[0].body.replace(/\r?\n/g, '\r\n');
      const first = await window.inkNote.notes.create({
        title: 'Preview twin A',
        body,
      });
      const second = await window.inkNote.notes.create({
        title: 'Preview twin B',
        body,
      });
      return { first, second };
    }, ready.note.data.id);
    assert(twins.first.ok && twins.second.ok);
    await selectNote(page, 'Preview twin A');
    await selectNote(page, 'Preview twin B');
    await typeAndMeasure(
      twins.second.data.id,
      'AfterDiagramAnchor',
      'crlf-twin',
    );
    // Two commands in one event task can return to the same text without a
    // deferred preview commit. Scroll must still recognize that current text.
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.up('Shift');
    assert.equal(
      await page.evaluate(() => document.getSelection()?.toString()),
      'z',
    );
    const roundTrip = await page.evaluate((mac) => {
      const editor = document.querySelector('.cm-content');
      const before = editor.textContent;
      for (let i = 0; i < 2; i++)
        editor.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'b',
            metaKey: mac,
            ctrlKey: !mac,
            bubbles: true,
            cancelable: true,
          }),
        );
      return { before, after: editor.textContent };
    }, process.platform === 'darwin');
    assert.equal(
      roundTrip.after,
      roundTrip.before,
      'Repeated bold must restore the original text.',
    );
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 250)),
    );
    const beforeScroll = await page.$eval(
      '.pane--preview',
      (pane) => pane.scrollTop,
    );
    const gesture = await page.$eval('.cm-scroller', (pane) => {
      const bounds = pane.getBoundingClientRect();
      return {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
        top: pane.scrollTop,
      };
    });
    await page.mouse.move(gesture.x, gesture.y);
    await page.mouse.wheel({ deltaY: -300 });
    await page.waitForFunction(
      (top) =>
        Math.abs(document.querySelector('.cm-scroller').scrollTop - top) > 100,
      {},
      gesture.top,
    );
    await page.waitForFunction(
      (top) =>
        Math.abs(document.querySelector('.pane--preview').scrollTop - top) >
        100,
      {},
      beforeScroll,
    );
    reports.at(-1).formatRoundTrip = await page.evaluate(
      ({ editorTop, previewTop }) => ({
        sourceUnchanged: true,
        editorScrollDelta:
          document.querySelector('.cm-scroller').scrollTop - editorTop,
        previewScrollDelta:
          document.querySelector('.pane--preview').scrollTop - previewTop,
      }),
      { editorTop: gesture.top, previewTop: beforeScroll },
    );
    console.log(
      'Native same-text format round trip and subsequent scroll passed.',
      JSON.stringify(reports.at(-1).formatRoundTrip),
    );
    await writeFile(
      path.join(profile, 'preview-stability.json'),
      JSON.stringify(reports, null, 2),
    );
    console.log(`Preview stability evidence: ${profile}`);
    const summary = reports.map(
      ({ mode, marker, frames, loading, svgRemovals }) => ({
        mode,
        marker,
        loading,
        svgRemovals,
        measured: frames.filter((f) => f.current).length,
        editorReplaced: frames.some((f) => !f.editorPresent),
        maxDelta: Math.max(
          ...frames
            .filter((f) => f.delta !== null)
            .map((f) => Math.abs(f.delta)),
        ),
        transientMoves: frames.filter(
          (f, i) =>
            i &&
            Math.abs(f.previewTop - frames[i - 1].previewTop) > 30 &&
            f.source === frames[i - 1].source,
        ).length,
      }),
    );
    console.log(JSON.stringify(summary, null, 2));
    for (const report of summary) {
      assert(report.measured > 20, 'Measure live typing and autosave frames.');
      assert.equal(
        report.editorReplaced,
        false,
        'Typing and autosave preserve the editor instance.',
      );
      assert.equal(
        report.loading,
        0,
        'Autosave must not show a foreground list reload.',
      );
      assert.equal(
        report.svgRemovals,
        0,
        'Typing outside diagrams preserves their mounted SVG.',
      );
      assert(
        report.maxDelta <= 2,
        'Every current preview frame aligns the typed glyph before it is painted.',
      );
    }
  } finally {
    await page.evaluate(
      (preferences) => window.inkNote.preferences.update(preferences),
      original.data.preferences,
    );
    await page.setViewport(viewport);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.inknote-shell');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNativeCheck(verifyPreviewStability);
