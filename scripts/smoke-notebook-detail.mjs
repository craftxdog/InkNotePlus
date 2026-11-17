import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';

const firstName = 'QA Detail first';
const secondName = 'QA Detail second with a deliberately long notebook name';
const row = (name) =>
  `.notebook-row:has(.notebook-detail[aria-label=${JSON.stringify(`Detail de ${name}`)}])`;
const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

export async function verifyNotebookDetail({ page, profile }) {
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  assert.equal(original.ok, true);
  for (const name of [firstName, secondName]) {
    const created = await page.evaluate(
      (name) => window.inkNote.library.createNotebook({ name }),
      name,
    );
    assert.equal(created.ok, true);
  }

  try {
    for (const theme of ['inknote-light', 'solarized-dark', 'inknote-dark']) {
      const updated = await page.evaluate(
        (theme) =>
          window.inkNote.preferences.update({
            theme,
            sidebarWidth: 260,
            showNoteCounts: true,
            notebookScopeId: null,
          }),
        theme,
      );
      assert.equal(updated.ok, true);
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector(`${row(firstName)} .notebook-select`);
      await page.click(`${row(firstName)} .notebook-select`);
      await page.waitForSelector(`${row(firstName)}[data-active='true']`);
      await page.hover(row(secondName));
      await page.waitForFunction(
        (selector) => {
          const button = document.querySelector(`${selector} .notebook-detail`);
          return button && getComputedStyle(button).visibility === 'visible';
        },
        {},
        row(secondName),
      );
      await settle(page);

      const state = await page.$$eval('.notebook-row', (rows) =>
        rows.map((row) => ({
          name: row.querySelector('.navigation-label').textContent,
          active: row.dataset.active === 'true',
          detail: getComputedStyle(row.querySelector('.notebook-detail'))
            .visibility,
          count: getComputedStyle(row.querySelector('.navigation-count'))
            .visibility,
        })),
      );
      const first = state.find((item) => item.name === firstName);
      const second = state.find((item) => item.name === secondName);
      assert.equal(first.active, true, 'Keep the clicked notebook selected.');
      assert.equal(
        first.detail,
        'hidden',
        `${theme}: mouse focus must not leave Detail visible on the previous row.`,
      );
      assert.equal(first.count, 'visible');
      assert.equal(second.detail, 'visible');
      assert.equal(second.count, 'hidden');

      const pill = await page.$eval(
        `${row(secondName)} .notebook-detail`,
        (button) => {
          const style = getComputedStyle(button);
          return {
            background: style.backgroundColor,
            border: style.borderTopStyle,
            borderWidth: style.borderTopWidth,
            height: button.getBoundingClientRect().height,
            rowHeight: button.closest('.notebook-row').getBoundingClientRect()
              .height,
            labelRight: button
              .closest('.notebook-row')
              .querySelector('.navigation-label')
              .getBoundingClientRect().right,
            left: button.getBoundingClientRect().left,
          };
        },
      );
      assert.equal(pill.background, 'rgba(0, 0, 0, 0)');
      assert.equal(pill.border, 'solid');
      assert.equal(pill.borderWidth, '1px');
      assert.ok(pill.height < pill.rowHeight, 'Detail remains a compact pill.');
      assert.ok(
        pill.labelRight < pill.left,
        'Long notebook names must not overlap Detail.',
      );
      await page.screenshot({
        path: path.join(profile, `notebook-detail-${theme}.png`),
      });

      // A keyboard user must discover Detail before tabbing to it, even when
      // the pointer is outside the sidebar and the action is normally hidden.
      await page.click(`${row(firstName)} .notebook-select`);
      await page.mouse.move(500, 40);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(
        (selector) =>
          document
            .querySelector(`${selector} .notebook-select`)
            ?.matches(':focus-visible') &&
          getComputedStyle(
            document.querySelector(`${selector} .notebook-detail`),
          ).visibility === 'visible',
        {},
        row(firstName),
      );
      await page.hover(`${row(firstName)} .notebook-select`);
      // macOS uses Option-Tab to include buttons when Full Keyboard Access is off.
      if (process.platform === 'darwin') await page.keyboard.down('Alt');
      await page.keyboard.press('Tab');
      if (process.platform === 'darwin') await page.keyboard.up('Alt');
      assert.equal(
        await page.$eval(
          `${row(firstName)} .notebook-detail`,
          (button) => button === document.activeElement,
        ),
        true,
        'Detail stays in the keyboard focus order.',
      );
      await page.keyboard.press('Enter');
      await page.waitForSelector('.notebook-breadcrumbs');
      assert.ok(
        await page.$eval(
          '.notebook-breadcrumbs',
          (nav, name) => nav.textContent.includes(name),
          firstName,
        ),
        'Detail opens the chosen notebook context.',
      );
      await page.click('button[aria-label="Volver a biblioteca"]');
      await page.waitForSelector(`${row(firstName)} .notebook-select`);
    }
    console.log(
      'Notebook Detail: hover, mouse focus, keyboard access, context and three themes passed.',
    );
  } finally {
    const restored = await page.evaluate(
      (preferences) => window.inkNote.preferences.update(preferences),
      original.data.preferences,
    );
    assert.equal(restored.ok, true);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNativeCheck(verifyNotebookDetail);
