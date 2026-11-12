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
  await page.keyboard.press(process.platform === 'darwin' ? 'ArrowUp' : 'Home');
  await page.keyboard.up(modifier);
  // Short source lines have exactly one visual row in this fixture.
  const line = body.split('\n').indexOf('StableResizeParagraph');
  for (let index = 0; index < line; index++)
    await page.keyboard.press('ArrowDown');
  await settle(page);
  for (let index = 0; index < 3; index++)
    await page.keyboard.press('ArrowDown');
  await settle(page);
  const before = await page.evaluate(positions);
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNativeCheck(verifyScrollReflow);
