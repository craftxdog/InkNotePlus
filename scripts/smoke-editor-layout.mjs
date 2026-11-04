import assert from 'node:assert/strict';
import { verifyLineWrapping } from './smoke-line-wrapping.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const editorSelector = '.cm-scroller';
const previewSelector = '.pane--preview';

const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 180)),
        ),
      ),
  );

// DOM ranges measure actual wrapped text rows, independently of CodeMirror's
// logical-line geometry and the preview's source-block mapping.
function renderedWords({ words, from, needle }) {
  const panes = {
    editor: {
      text: document.querySelector('.cm-content'),
      viewport: document.querySelector('.cm-scroller'),
    },
    preview: {
      text: document.querySelector('.mde-preview'),
      viewport: document.querySelector('.pane--preview'),
    },
  };
  function measure(pane, word) {
    const { text, viewport } = panes[pane];
    const offset = text.textContent.indexOf(word);
    if (offset < 0) return null;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let consumed = 0;
    let started = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const end = consumed + node.textContent.length;
      if (!started && offset < end) {
        range.setStart(node, offset - consumed);
        started = true;
      }
      if (started && offset + word.length <= end) {
        range.setEnd(node, offset + word.length - consumed);
        break;
      }
      consumed = end;
    }
    const rect = [...range.getClientRects()]
      .filter((item) => item.width && item.height)
      .at(-1);
    if (!rect) return null;
    const bounds = viewport.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(text).lineHeight);
    return {
      y: (rect.top + rect.bottom) / 2 - bounds.top,
      lineHeight,
      height: bounds.height,
      visible: rect.bottom > bounds.top && rect.top < bounds.bottom,
    };
  }
  let word = needle;
  if (!word) {
    const targetY = panes[from].viewport.clientHeight * 0.35;
    const visible = words
      .map((word) => ({ word, position: measure(from, word) }))
      .filter((item) => item.position?.visible)
      .sort(
        (a, b) =>
          Math.abs(a.position.y - targetY) - Math.abs(b.position.y - targetY),
      );
    word = visible[0]?.word;
  }
  return {
    word,
    editor: word ? measure('editor', word) : null,
    preview: word ? measure('preview', word) : null,
    scrollTop: Object.fromEntries(
      Object.entries(panes).map(([pane, value]) => [
        pane,
        value.viewport.scrollTop,
      ]),
    ),
  };
}

function assertSameVisualRow(positions, description) {
  const details = `${description}: ${JSON.stringify(positions)}`;
  assert.ok(positions.word, `A fixture word must be visible. ${details}`);
  assert.ok(
    positions.editor?.visible && positions.preview?.visible,
    `The corresponding word must remain visible in both panes. ${details}`,
  );
  const tolerance =
    Math.max(positions.editor.lineHeight, positions.preview.lineHeight) * 3;
  assert.ok(
    Math.abs(positions.editor.y - positions.preview.y) <= tolerance,
    `Corresponding wrapped text must align within three visual rows. ${details}`,
  );
}

async function assertSettled(page, description) {
  const read = () =>
    page.evaluate(
      (selectors) =>
        selectors.map((selector) => document.querySelector(selector).scrollTop),
      [editorSelector, previewSelector],
    );
  const initial = await read();
  await settle(page);
  const final = await read();
  assert.ok(
    final.every((value, index) => Math.abs(value - initial[index]) < 2),
    `${description} must settle without a feedback loop: ${JSON.stringify({ initial, final })}`,
  );
}

export async function verifyEditorLayout(page) {
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  assert.equal(original.ok, true, 'Native preferences must be available.');
  const words = Array.from(
    { length: 60 },
    (_, index) => `passage${String(index).padStart(3, '0')}`,
  );
  // Deliberately vary the amount of source markup within one logical line.
  // Whole-paragraph percentage mapping cannot identify the visible source word.
  const paragraph = words
    .map((word, index) => {
      const prose = `${word} The notebook keeps careful observations as the project develops.`;
      return index < 30
        ? `${prose} Read [the reference guide](https://example.invalid/documentation/notes/source-mapping-and-editor-layout/${index}) for **practical details**.`
        : `${index === 30 ? 'cursorword ' : ''}${prose} We compare the next result with earlier observations and continue writing.`;
    })
    .join(' ');
  const body = `# Wrapped paragraph regression\n\n${paragraph}\n\n## End of note\n\nA final paragraph leaves room below the editing position.`;
  assert.equal(paragraph.includes('\n'), false);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  try {
    const updated = await page.evaluate(
      (patch) => window.inkNote.preferences.update(patch),
      {
        editorMode: 'split',
        splitRatio: 42,
        editorFontFamily: 'monospace',
        editorFontSize: 15,
        editorLineHeight: 1.6,
        previewFontFamily: 'serif',
        previewFontSize: 19,
        previewLineHeight: 1.5,
        lineWrapping:
          typeof original.data.preferences.lineWrapping === 'boolean'
            ? true
            : 'all',
        syncScroll: true,
      },
    );
    assert.equal(updated.ok, true);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('button[aria-label="Nueva nota"]');
    await page.click('button[aria-label="Nueva nota"]');
    await page.waitForSelector('.cm-content');
    await page.focus('.cm-content');
    await page.keyboard.sendCharacter(body);
    await page.waitForFunction(() =>
      document
        .querySelector('.mde-preview')
        ?.textContent.includes('passage059'),
    );
    await settle(page);
    const dimensions = await page.evaluate(() => {
      const editor = document.querySelector('.cm-scroller');
      const preview = document.querySelector('.pane--preview');
      return {
        editorRows: editor.scrollHeight / editor.clientHeight,
        previewRows: preview.scrollHeight / preview.clientHeight,
        widthDifference: Math.abs(editor.clientWidth - preview.clientWidth),
      };
    });
    assert.ok(
      dimensions.editorRows > 4 &&
        dimensions.previewRows > 4 &&
        dimensions.widthDifference > 40,
      `The fixture must exercise a long paragraph and unequal panes: ${JSON.stringify(dimensions)}`,
    );

    await page.keyboard.down(modifier);
    await page.keyboard.press('f');
    await page.keyboard.up(modifier);
    await page.waitForSelector('.cm-search input[name="search"]');
    await page.type('.cm-search input[name="search"]', 'cursorword');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.cm-search', { hidden: true });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.sendCharacter('edit');
    await page.waitForFunction(() =>
      document
        .querySelector('.mde-preview')
        ?.textContent.includes('cursorwordedit'),
    );
    await settle(page);
    assertSameVisualRow(
      await page.evaluate(renderedWords, { needle: 'cursorwordedit' }),
      'Typing midway through a wrapped logical line',
    );
    await assertSettled(page, 'Cursor following');

    for (const [from, selector, fraction] of [
      ['editor', editorSelector, 0.35],
      ['preview', previewSelector, 0.68],
    ]) {
      await page.evaluate(
        (selector, fraction) => {
          document.activeElement.blur();
          const pane = document.querySelector(selector);
          pane.scrollTop = (pane.scrollHeight - pane.clientHeight) * fraction;
        },
        selector,
        fraction,
      );
      await settle(page);
      assertSameVisualRow(
        await page.evaluate(renderedWords, { words, from }),
        `${from} scrolling within one wrapped paragraph`,
      );
      await assertSettled(page, `${from} scrolling`);
    }
    console.log(
      'Native wrapped cursor following and bidirectional scroll passed.',
    );
  } finally {
    const restored = await page.evaluate(
      (preferences) => window.inkNote.preferences.update(preferences),
      original.data.preferences,
    );
    assert.equal(restored.ok, true, 'Restore native layout preferences.');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.inknote-shell');
  }
}

async function runStandalone() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const profile = await mkdtemp(path.join(tmpdir(), 'inknote-layout-smoke-'));
  const child = spawn(
    process.execPath,
    [
      path.join(
        root,
        'node_modules/@electron-forge/cli/dist/electron-forge.js',
      ),
      'start',
      '--',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      '--enable-logging=stderr',
    ],
    {
      cwd: root,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let browser;
  let page;
  const errors = [];
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(new Error(`Electron did not start.\n${output.slice(-4000)}`)),
        45_000,
      );
      const collect = (chunk) => {
        output += chunk.toString();
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Electron exited (${code}).\n${output.slice(-4000)}`));
      });
    });
    browser = await puppeteer.connect({
      browserWSEndpoint: endpoint,
      defaultViewport: null,
      protocolTimeout: 15_000,
    });
    const target = await browser.waitForTarget(
      (target) =>
        target.type() === 'page' && /^(file:|https?:)/.test(target.url()),
    );
    page = await target.page();
    page.setDefaultTimeout(10_000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForSelector('.inknote-shell');
    const notes = await page.evaluate(() => window.inkNote.notes.list());
    assert.equal(
      notes.ok,
      true,
      'The native preload and SQLite IPC must work.',
    );
    assert.equal(
      notes.data.length,
      0,
      'Layout smoke requires a fresh profile.',
    );
    console.log(`Layout smoke temporary profile: ${profile}`);
    if (!process.argv.includes('--wrap-only')) await verifyEditorLayout(page);
    await verifyLineWrapping(page);
    assert.deepEqual(errors, [], 'The native renderer must remain error-free.');
  } catch (error) {
    await page
      ?.screenshot({ path: path.join(profile, 'layout-failure.png') })
      .catch(() => {});
    console.error(output.slice(-4000));
    throw error;
  } finally {
    if (browser) {
      await Promise.race([
        browser.close().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      browser.disconnect();
    }
    if (child.exitCode === null) {
      if (process.platform === 'win32') child.kill();
      else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
      }
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href &&
  process.argv.includes('--standalone')
) {
  await runStandalone();
}
