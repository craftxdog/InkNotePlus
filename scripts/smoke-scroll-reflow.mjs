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

function positions() {
  const editor = document.querySelector('.cm-scroller');
  const preview = document.querySelector('.pane--preview');
  const source = [...document.querySelectorAll('.cm-line')].find(
    (line) => line.textContent === 'StableResizeParagraph',
  );
  const rendered = [...document.querySelectorAll('.mde-preview p')].find(
    (element) => element.textContent === 'StableResizeParagraph',
  );
  return {
    editor:
      source.getBoundingClientRect().top - editor.getBoundingClientRect().top,
    preview:
      rendered.getBoundingClientRect().top -
      preview.getBoundingClientRect().top,
  };
}

export async function verifyScrollReflow({ page, profile }) {
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  assert.equal(original.ok, true);
  const viewport = page.viewport();
  try {
    await page.setViewport({ width: 1440, height: 1100 });
    const configured = await page.evaluate(() =>
      window.inkNote.preferences.update({
        editorMode: 'split',
        splitRatio: 50,
        editorFontSize: 14,
        editorLineHeight: 1.6,
        previewFontSize: 16,
        previewLineHeight: 1.5,
        activeLine: true,
        keyboardMode: 'standard',
        lineWrapping: 'all',
        readableLineLength: false,
        syncScroll: true,
      }),
    );
    assert.equal(configured.ok, true);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.inknote-shell');
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    const body = [
      '# Delayed block sizing',
      ...Array.from(
        { length: 12 },
        (_, index) => `## Section ${index}\nShort paragraph.`,
      ),
      'StableResizeParagraph',
      '```js\nconst UnmappedResizeCursor = true;\n```',
      '## More content',
      'Later paragraphs leave enough scroll room.\n\n'.repeat(20),
    ].join('\n\n');
    await page.click('button[aria-label="Nueva nota"]');
    await page.waitForSelector('.cm-content');
    await page.focus('.cm-content');
    await page.keyboard.sendCharacter(body);
    await page.waitForFunction(() =>
      document
        .querySelector('.mde-preview')
        ?.textContent.includes('StableResizeParagraph'),
    );
    await settle(page);
    await page.keyboard.down(modifier);
    await page.keyboard.press(
      process.platform === 'darwin' ? 'ArrowUp' : 'Home',
    );
    await page.keyboard.up(modifier);
    // Short source lines have exactly one visual row in this fixture.
    const line = body.split('\n').indexOf('StableResizeParagraph');
    for (let index = 0; index < line; index++)
      await page.keyboard.press('ArrowDown');
    await settle(page);
    // Confirm a real caret anchor before entering unmapped code. Moving across
    // many rows can leave a different goal column or an outstanding viewport
    // update on slower CI machines.
    const paragraph = await page.waitForFunction(() =>
      [...document.querySelectorAll('.cm-line')].find(
        (element) => element.textContent === 'StableResizeParagraph',
      ),
    );
    const bounds = await paragraph.asElement().boundingBox();
    assert(bounds, 'The source paragraph must be visible.');
    await paragraph
      .asElement()
      .click({ offset: { x: 35, y: bounds.height / 2 } });
    console.log(
      'Reflow caret state:',
      await page.evaluate(() => ({
        active: document.activeElement?.className,
        line: document.querySelector('.cm-activeLine')?.textContent,
        selection: getSelection()?.anchorNode?.textContent?.slice(0, 80),
        viewport: { width: innerWidth, height: innerHeight },
      })),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('.cm-activeLine')?.textContent ===
        'StableResizeParagraph',
    );
    await settle(page);
    const aligned = await page.evaluate(positions);
    console.log('Reflow fixture mapped paragraph:', JSON.stringify(aligned));
    assert.ok(
      Math.abs(aligned.editor - aligned.preview) < 5,
      `The mapped paragraph must start aligned: ${JSON.stringify(aligned)}`,
    );
    for (let index = 0; index < 3; index++)
      await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() =>
      document
        .querySelector('.cm-activeLine')
        ?.textContent.includes('UnmappedResizeCursor'),
    );
    await settle(page);
    const before = await page.evaluate(positions);
    console.log('Reflow fixture unmapped cursor:', JSON.stringify(before));
    assert.ok(
      Math.abs(before.editor - before.preview) < 5,
      `The fixture must start aligned: ${JSON.stringify(before)}`,
    );
    // A delayed image/diagram can resize after editing. Native scroll anchoring
    // is not guaranteed during its suppression window, so exercise that case.
    await page.evaluate(() => {
      const pane = document.querySelector('.pane--preview');
      pane.style.overflowAnchor = 'none';
      const block = pane.querySelector('.mde-preview > :first-child');
      block.style.marginBottom = `${Number.parseFloat(getComputedStyle(block).marginBottom) + 120}px`;
    });
    await settle(page);
    const after = await page.evaluate(positions);
    await page.screenshot({ path: path.join(profile, 'scroll-reflow.png') });
    console.log('Unmapped cursor reflow:', JSON.stringify({ before, after }));
    assert.ok(
      Math.abs(after.preview - after.editor) < 5,
      'A delayed block must not move the shared reading reference away from the editor',
    );
    await settle(page);
    const final = await page.evaluate(positions);
    assert.ok(
      Math.abs(final.preview - after.preview) < 2,
      'Reflow must settle without a feedback loop',
    );
    console.log('Native delayed block growth with an unmapped cursor passed.');
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
  await runNativeCheck(verifyScrollReflow);
