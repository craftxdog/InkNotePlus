import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyNotebookNavigation({ page, profile, notebookId }) {
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  const library = await page.evaluate(() => window.inkNote.library.get());
  const parent = library.data.notebooks.find((book) => book.id === notebookId);
  assert.ok(parent);
  const note = await page.evaluate(
    async (notebookId) =>
      (await window.inkNote.notes.list()).data.find(
        (note) => note.metadata.notebookId === notebookId,
      ),
    notebookId,
  );
  assert.ok(note);
  const child = await page.evaluate(
    (parentId) =>
      window.inkNote.library.createNotebook({
        name: 'Projects',
        parentId,
        icon: 'rocket',
      }),
    notebookId,
  );
  assert.equal(child.ok, true);
  // IPC fixture creation bypasses the UI action that refreshes the catalogue.
  await page.reload({ waitUntil: 'networkidle0' });
  const trigger = 'button[aria-label^="Notebook de la nota:"]';
  const popup = '.notebook-picker-menu';
  const search = '.notebook-picker-search input';
  await page.waitForSelector(trigger);
  await page.click(trigger);
  await page.waitForFunction(() =>
    document.querySelector('.notebook-picker-menu')?.matches(':popover-open'),
  );
  assert.equal(
    await page.$eval(search, (input) => input === document.activeElement),
    true,
  );
  await page.type(search, 'Projects');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    async ({ id, child }) =>
      (await window.inkNote.notes.list()).data.find((note) => note.id === id)
        ?.metadata.notebookId === child,
    {},
    { id: note.id, child: child.data.id },
  );
  const moved = await page.evaluate(
    async (id) =>
      (await window.inkNote.notes.list()).data.find((note) => note.id === id),
    note.id,
  );
  assert.deepEqual(moved.metadata, {
    ...note.metadata,
    notebookId: child.data.id,
  });
  assert.equal(moved.body, note.body);
  assert.equal(
    await page.$eval(
      trigger,
      (button) => button.querySelector('.lucide-rocket') !== null,
    ),
    true,
  );
  await page.click(trigger);
  await page.type(search, 'No matching notebook');
  await page.keyboard.press('Enter');
  assert.ok(await page.$(`${popup} [role="status"]`));
  await page.keyboard.press('Escape');
  await page.waitForSelector(popup, { hidden: true });
  assert.equal(
    await page.$eval(trigger, (button) => button === document.activeElement),
    true,
  );
  await page.click(trigger);
  await page.click('.document-title-input');
  await page.waitForSelector(popup, { hidden: true });
  await page.click(trigger);
  await page.click(trigger);
  await page.waitForSelector(popup, { hidden: true });

  await page.click('button[aria-label="Filtrar notebooks"]');
  await page.type(
    'input[aria-label="Buscar notebooks en la biblioteca"]',
    'Projects',
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.notebook-select')].some((book) =>
      book.textContent.includes('Projects'),
    ),
  );
  const filteredPreferences = await page.evaluate(() =>
    window.inkNote.preferences.get(),
  );
  assert.deepEqual(
    filteredPreferences.data.preferences.expandedNotebookIds,
    original.data.preferences.expandedNotebookIds,
  );
  await page.keyboard.press('Escape');
  if (
    await page.$(
      `button[aria-label=${JSON.stringify(`Expandir ${parent.name}`)}]`,
    )
  )
    await page.click(
      `button[aria-label=${JSON.stringify(`Expandir ${parent.name}`)}]`,
    );
  const alignment = await page.evaluate(() => {
    const inbox = document
      .querySelector('.navigation-item--notebook > svg')
      ?.getBoundingClientRect();
    const root = document
      .querySelector(
        '.notebook-row[data-notebook-depth="0"] .notebook-icon-action',
      )
      ?.getBoundingClientRect();
    return inbox && root ? Math.abs(inbox.left - root.left) : null;
  });
  assert.ok(
    alignment !== null && alignment < 2,
    `Notebook icons must align: ${alignment}`,
  );

  const colors = new Set();
  try {
    for (const theme of ['inknote-light', 'solarized-light', 'inknote-dark']) {
      await page.evaluate(
        (theme) => window.inkNote.preferences.update({ theme }),
        theme,
      );
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector(trigger);
      await page.click(trigger);
      await page.waitForFunction(() =>
        document
          .querySelector('.notebook-picker-menu')
          ?.matches(':popover-open'),
      );
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.$eval(popup, (menu) => {
        const box = menu.getBoundingClientRect();
        const style = getComputedStyle(menu);
        return {
          left: box.left,
          right: box.right,
          bottom: box.bottom,
          width: innerWidth,
          height: innerHeight,
          background: style.backgroundColor,
          border: style.borderTopStyle,
        };
      });
      assert.ok(
        layout.left >= 0 &&
          layout.right <= layout.width &&
          layout.bottom <= layout.height,
        JSON.stringify(layout),
      );
      assert.equal(layout.border, 'solid');
      colors.add(layout.background);
      await page.screenshot({
        path: path.join(profile, `notebook-picker-${theme}.png`),
      });
      await page.keyboard.press('Escape');
    }
    assert.equal(
      colors.size,
      3,
      'All three theme palettes must reach the picker.',
    );
    await page.setViewport({ width: 800, height: 560 });
    await page.click(trigger);
    const narrow = await page.$eval(popup, (menu) => {
      const box = menu.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        bottom: box.bottom,
        width: innerWidth,
        height: innerHeight,
      };
    });
    assert.ok(
      narrow.left >= 0 &&
        narrow.right <= narrow.width &&
        narrow.bottom <= narrow.height,
      JSON.stringify(narrow),
    );
    await page.screenshot({
      path: path.join(profile, 'notebook-picker-narrow.png'),
    });
    await page.keyboard.press('Escape');
    await page.setViewport(null);
    await page.click(trigger);
    await page.click(
      `.notebook-picker-option[aria-label=${JSON.stringify(parent.name)}]`,
    );
    await page.waitForFunction(
      async ({ id, parent }) =>
        (await window.inkNote.notes.list()).data.find((note) => note.id === id)
          ?.metadata.notebookId === parent,
      {},
      { id: note.id, parent: notebookId },
    );
  } finally {
    await page.evaluate(
      (preferences) => window.inkNote.preferences.update(preferences),
      original.data.preferences,
    );
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.cm-content');
  }
  console.log(
    `Notebook picker: hierarchy, search, autosave, Escape, outside click, sidebar alignment, three themes and viewport bounds passed.\nScreenshots: ${profile}`,
  );
}
