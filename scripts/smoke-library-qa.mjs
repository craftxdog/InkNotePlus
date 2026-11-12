import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';

async function button(page, label, selector = 'button') {
  const handle = await page.waitForFunction(
    ({ selector, label }) =>
      [...document.querySelectorAll(selector)].find(
        (element) =>
          element.checkVisibility() &&
          !element.disabled &&
          (
            element.querySelector('.navigation-label, .note-row-title')
              ?.textContent ?? element.textContent
          ).trim() === label,
      ),
    {},
    { selector, label },
  );
  return handle.asElement();
}

async function confirm(page) {
  const submit = await page.waitForSelector(
    '.app-dialog button[type="submit"]',
    { visible: true },
  );
  await submit.click();
  await page.waitForSelector('.app-dialog', { hidden: true });
}

export async function verifyLibraryQa({ page }) {
  const fixture = await page.evaluate(async () => {
    const root = await window.inkNote.library.createNotebook({
      name: 'QA parent',
    });
    if (!root.ok) throw new Error('Cannot seed the parent notebook.');
    const child = await window.inkNote.library.createNotebook({
      name: 'QA child',
      parentId: root.data.id,
    });
    if (!child.ok) throw new Error('Cannot seed the child notebook.');
    const metadata = {
      notebookId: child.data.id,
      status: 'active',
      isTemplate: false,
      tags: ['QA original'],
    };
    const note = await window.inkNote.notes.create({
      title: 'QA library note',
      body: 'Preserved body',
      metadata,
    });
    if (!note.ok) throw new Error('Cannot seed the library note.');
    return { root: root.data, child: child.data, note: note.data };
  });
  await (await button(page, 'QA original')).click({ button: 'right' });
  await (await button(page, 'Editar etiqueta…', '[role="menuitem"]')).click();
  await page.waitForSelector('.app-dialog input[type="text"]');
  await page.$eval('.app-dialog input[type="text"]', (input) => input.select());
  await page.keyboard.sendCharacter('QA renamed');
  await page.select('.app-dialog select', 'violet');
  await confirm(page);
  await page.waitForFunction(
    async (id) => {
      const result = await window.inkNote.notes.list({ id });
      return result.ok && result.data[0].metadata.tags.includes('QA renamed');
    },
    {},
    fixture.note.id,
  );
  const renamed = await button(page, 'QA renamed');
  assert(await renamed.$('.tag-color-violet'));
  await renamed.click({ button: 'right' });
  await (await button(page, 'Eliminar etiqueta…', '[role="menuitem"]')).click();
  await confirm(page);
  assert.equal(
    await page.evaluate(
      async (id) =>
        (await window.inkNote.notes.list({ id })).data[0].metadata.tags.length,
      fixture.note.id,
    ),
    0,
  );

  await (
    await button(page, 'QA parent', '.notebook-row button')
  ).click({ button: 'right' });
  await (await button(page, 'Eliminar notebook…', '[role="menuitem"]')).click();
  await confirm(page);
  const deleted = await page.evaluate(async () => window.inkNote.library.get());
  assert.equal(deleted.data.notebooks.length, 0);
  assert.equal(deleted.data.trash, 1);
  await (await button(page, 'Papelera')).click();
  await (await button(page, 'QA library note', '.note-list-item')).click();
  await (await button(page, 'Mover a notebook…')).click();
  await confirm(page);
  const restored = await page.evaluate(
    async (id) => (await window.inkNote.notes.list({ id })).data[0],
    fixture.note.id,
  );
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.metadata.notebookId, null);
  assert.equal(restored.body, 'Preserved body');
  const trashed = await page.evaluate(
    async (id) =>
      window.inkNote.notes.manageTrash({ action: 'trash', ids: [id] }),
    fixture.note.id,
  );
  assert.equal(trashed.ok, true);
  await (await button(page, 'Papelera')).click();
  await (await button(page, 'QA library note', '.note-list-item')).click();
  await (await button(page, 'Eliminar definitivamente…')).click();
  await confirm(page);
  const empty = await page.evaluate(async () => window.inkNote.library.get());
  assert.equal(empty.data.total, 0);
  assert.equal(empty.data.trash, 0);
  console.log(
    'Native tag rename/color/delete, notebook subtree deletion, Trash, restore and permanent deletion passed.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNativeCheck(verifyLibraryQa);
