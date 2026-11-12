import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';

const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 180)),
        ),
      ),
  );

function markerPosition(needle = 'StableEnterAnchor') {
  const editor = document.querySelector('.cm-scroller');
  const preview = document.querySelector('.pane--preview');
  const source = [...document.querySelectorAll('.cm-line')].find((line) =>
    line.textContent.includes(needle),
  );
  const rendered = [
    ...document.querySelectorAll('.mde-preview h2, .mde-preview p'),
  ].find((element) => element.textContent === needle);
  return {
    editor: {
      top: editor.scrollTop,
      markerY:
        source.getBoundingClientRect().top - editor.getBoundingClientRect().top,
      height: editor.clientHeight,
      lineHeight: Number.parseFloat(getComputedStyle(source).lineHeight),
    },
    preview: {
      top: preview.scrollTop,
      markerY:
        rendered.getBoundingClientRect().top -
        preview.getBoundingClientRect().top,
      height: preview.clientHeight,
      lineHeight: Number.parseFloat(getComputedStyle(rendered).lineHeight),
    },
  };
}

function assertStableShift(before, after, description) {
  const sourceShift = after.editor.markerY - before.editor.markerY;
  const previewShift = after.preview.markerY - before.preview.markerY;
  assert.ok(
    Math.abs(sourceShift - previewShift) < 2,
    `${description}: ${JSON.stringify({ before, after })}`,
  );
}

export async function verifyEnterScroll({ page, profile }) {
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  assert.equal(original.ok, true);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const body = [
    '# Enter scroll regression',
    ...Array.from(
      { length: 8 },
      (_, index) =>
        `## Section ${index + 1}\nA short paragraph with **visible formatting** and a [link](https://example.invalid/notes).`,
    ),
    '## StableEnterAnchor',
  ].join('\n\n');
  try {
    await page.setViewport({ width: 1440, height: 1100 });
    const updated = await page.evaluate(
      (patch) => window.inkNote.preferences.update(patch),
      {
        editorMode: 'split',
        splitRatio: 50,
        editorFontSize: 15,
        editorLineHeight: 1.6,
        previewFontSize: 19,
        previewLineHeight: 1.5,
        lineWrapping: 'all',
        syncScroll: true,
      },
    );
    assert.equal(updated.ok, true);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.click('button[aria-label="Nueva nota"]');
    await page.waitForSelector('.cm-content');
    await page.focus('.cm-content');
    await page.keyboard.sendCharacter(body);
    await page.waitForFunction(() =>
      document
        .querySelector('.mde-preview')
        ?.textContent.includes('StableEnterAnchor'),
    );
    await settle(page);
    const before = await page.evaluate(markerPosition);
    assert.ok(
      before.preview.top > 100,
      `The preview must follow the final heading: ${JSON.stringify(before)}`,
    );
    await page.screenshot({ path: path.join(profile, 'enter-before.png') });
    await page.keyboard.press('Enter');
    await settle(page);
    const after = await page.evaluate(markerPosition);
    await page.screenshot({ path: path.join(profile, 'enter-after.png') });
    console.log('Enter scroll geometry:', JSON.stringify({ before, after }));
    assertStableShift(
      before,
      after,
      'Enter must preserve the visible heading alignment before any new text is typed',
    );
    await settle(page);
    assertStableShift(
      after,
      await page.evaluate(markerPosition),
      'An idle frame must not drift',
    );
    await page.keyboard.press('Backspace');
    await settle(page);
    const restored = await page.evaluate(markerPosition);
    assertStableShift(
      after,
      restored,
      'Deleting the blank line must keep the anchor',
    );
    await page.keyboard.press('Enter');
    await settle(page);
    assertStableShift(
      restored,
      await page.evaluate(markerPosition),
      'Repeating Enter must keep the anchor',
    );
    await page.keyboard.sendCharacter('LiveEnterParagraph');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.mde-preview p')].some(
        (element) => element.textContent === 'LiveEnterParagraph',
      ),
    );
    await settle(page);
    const typed = await page.evaluate(markerPosition, 'LiveEnterParagraph');
    assert.ok(
      typed.editor.markerY >= 0 && typed.editor.markerY < typed.editor.height,
    );
    assert.ok(
      typed.preview.markerY >= 0 &&
        typed.preview.markerY < typed.preview.height,
    );
    assert.ok(
      Math.abs(typed.editor.markerY - typed.preview.markerY) <=
        Math.max(typed.editor.lineHeight, typed.preview.lineHeight),
      'Typing again must follow the newly rendered paragraph',
    );
    // Test the paragraph away from the scroll limit: Markdown omits the new
    // blank line, so a final paragraph can otherwise run out of preview space.
    await page.keyboard.sendCharacter(
      `\n\n## Later content\n\n${'A later paragraph provides scrolling room. '.repeat(30)}`,
    );
    await page.keyboard.down(modifier);
    await page.keyboard.press('f');
    await page.keyboard.up(modifier);
    await page.waitForSelector('.cm-search input[name="search"]');
    await page.type('.cm-search input[name="search"]', 'LiveEnterParagraph');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.cm-search', { hidden: true });
    await page.keyboard.press('ArrowRight');
    await settle(page);
    const paragraph = await page.evaluate(markerPosition, 'LiveEnterParagraph');
    assert.ok(
      await page.$eval(
        '.pane--preview',
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop > 50,
      ),
      'The paragraph case must leave room to follow editor auto-scroll',
    );
    await page.keyboard.press('Enter');
    await settle(page);
    assertStableShift(
      paragraph,
      await page.evaluate(markerPosition, 'LiveEnterParagraph'),
      'Enter after a paragraph must also keep the anchor',
    );
    console.log(
      'Native heading/paragraph Enter, Backspace, repeated Enter, idle and live typing scroll passed.',
    );
  } finally {
    await page.evaluate(
      (preferences) => window.inkNote.preferences.update(preferences),
      original.data.preferences,
    );
    await page.setViewport(null);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.inknote-shell');
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runNativeCheck(verifyEnterScroll);
}
