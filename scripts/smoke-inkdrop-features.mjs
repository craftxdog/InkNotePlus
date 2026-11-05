import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chooseNoteStatus } from './smoke-status-alerts.mjs';

export async function verifyInkdropFeatures({
  page,
  profile,
  modifier,
  settle,
  catalogEnabled = false,
}) {
  const clickText = (selector, text) =>
    page.$$eval(
      selector,
      (elements, value) => {
        const element = elements.find((item) =>
          item.textContent.includes(value),
        );
        if (!element) throw new Error(`Missing ${value}`);
        element.click();
      },
      text,
    );
  const openPreferences = async () => {
    await page.click('button[aria-label="Preferencias"]');
    await page.click('#settings-tab-themes');
  };
  const chooseTheme = async (name) => {
    await page.select('select[aria-label="Tema"]', name);
    await page.waitForFunction(
      (name) =>
        document.documentElement.dataset.theme === name &&
        [
          ...document.querySelectorAll(`link[data-theme-package="${name}"]`),
        ].every((link) => link.media === 'all' && link.sheet),
      {},
      name,
    );
  };
  await openPreferences();
  const backgrounds = new Set();
  for (const name of [
    'inknote-light',
    'inknote-dark',
    'solarized-light',
    'solarized-dark',
    'kanagawa-wave',
    'kanagawa-dragon',
    'kanagawa-lotus',
  ]) {
    await chooseTheme(name);
    backgrounds.add(
      await page.$eval(
        '.pane--sidebar',
        (element) => getComputedStyle(element).backgroundColor,
      ),
    );
  }
  assert.ok(
    backgrounds.size >= 6,
    `Official theme palettes must change the actual UI: ${[...backgrounds]}`,
  );
  if (catalogEnabled) {
    await clickText('.settings-inline-actions .button', 'Explorar catálogo');
    await page.waitForSelector('.theme-registry-results li', {
      timeout: 25_000,
    });
    const name = await page.$$eval(
      '.theme-registry-results li',
      (rows) =>
        rows
          .find((row) => row.querySelector('button').textContent === 'Instalar')
          ?.querySelector('strong').textContent,
    );
    assert.ok(
      name,
      'The live catalog must offer an installable unified theme.',
    );
    await page.$$eval(
      '.theme-registry-results li',
      (rows, name) =>
        rows
          .find((row) => row.querySelector('strong').textContent === name)
          .querySelector('button')
          .click(),
      name,
    );
    await page.waitForFunction(
      (name) =>
        document.documentElement.dataset.theme === name ||
        !!document.querySelector('.preferences-panel [role=alert]'),
      { timeout: 45_000 },
      name,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.theme),
      name,
      await page.$eval('.preferences-panel', (panel) =>
        panel.textContent.slice(-1000),
      ),
    );
    await page.screenshot({
      path: path.join(profile, 'live-catalog-theme.png'),
    });
    console.log(
      `Installed and activated live catalog theme through Preferences: ${name}`,
    );
  }
  await chooseTheme('inknote-light');

  // Installed fixture exercises the real protocol/CSP and persisted package
  // discovery. Folder/archive copying and rejection paths have integration tests.
  const folder = path.join(profile, 'themes', 'native-theme', '1.0.0-test');
  await mkdir(path.join(folder, 'styles'), { recursive: true });
  const sheets = ['ui.css', 'syntax.css', 'preview.css'];
  for (const [index, file] of sheets.entries())
    await writeFile(
      path.join(folder, 'styles', file),
      `@layer theme.${['ui', 'syntax', 'preview'][index]} { :root { --native-theme-loaded-${index}: 1; } }`,
    );
  await writeFile(
    path.join(folder, '..', 'installed.json'),
    JSON.stringify({
      manifest: {
        name: 'native-theme',
        version: '1.0.0',
        theme: true,
        themeAppearance: 'light',
        styleSheets: sheets,
      },
      label: 'Native Theme',
      source: 'installed',
      styles: sheets.map(
        (file) =>
          `inknote-asset://themes/native-theme/1.0.0-test/styles/${file}`,
      ),
    }),
  );
  await page.reload({ waitUntil: 'networkidle0' });
  await openPreferences();
  await chooseTheme('native-theme');
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--native-theme-loaded-2')
        .trim(),
    ),
    '1',
  );
  await page.focus('textarea[aria-label="CSS personalizado"]');
  await page.$eval('textarea[aria-label="CSS personalizado"]', (element) =>
    element.select(),
  );
  await page.keyboard.sendCharacter(':root { --native-style-test: 42; }');
  await page.waitForFunction(async () =>
    (await window.inkNote.themes.getCustomStyles()).data?.includes('42'),
  );
  await writeFile(
    path.join(profile, 'styles.css'),
    ':root { --native-style-test: 43; }',
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--native-style-test')
        .trim() === '43',
  );
  await chooseTheme('solarized-light');
  await page.click('button[aria-label="Eliminar Native Theme"]');
  await page.waitForFunction(
    async () =>
      !(await window.inkNote.themes.list()).data?.some(
        (theme) => theme.manifest.name === 'native-theme',
      ),
  );
  await page.screenshot({ path: path.join(profile, 'official-themes.png') });
  await page.keyboard.press('Escape');

  const image = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 10;
    const context = canvas.getContext('2d');
    context.fillStyle = '#268bd2';
    context.fillRect(0, 0, 20, 10);
    return window.inkNote.images.write(
      canvas.toDataURL('image/png').split(',')[1],
    );
  });
  assert.equal(image.ok, true);
  assert.equal(image.data.width, 20);
  await page.evaluate(
    async (url) =>
      window.inkNote.notes.create({
        title: 'Native image resize',
        body: `![Caption width:50%](${url})`,
      }),
    image.data.url,
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.note-list-item')].some((element) =>
      element.textContent.includes('Native image resize'),
    ),
  );
  await clickText('.note-list-item', 'Native image resize');
  await page.waitForFunction(
    () => document.querySelector('.mde-preview img')?.naturalWidth === 20,
  );
  await page.focus('.cm-content');
  await page.keyboard.down(modifier);
  await page.keyboard.press(process.platform === 'darwin' ? 'ArrowUp' : 'Home');
  await page.keyboard.up(modifier);
  for (let index = 0; index < 4; index++)
    await page.keyboard.press('ArrowRight');
  await page.waitForSelector('select[aria-label="Tamaño de imagen"]');
  await page.select('select[aria-label="Tamaño de imagen"]', '30%');
  await page.waitForFunction(
    () => document.querySelector('.mde-preview img')?.style.width === '30%',
  );
  await page.waitForFunction(async () =>
    (
      await window.inkNote.notes.search({
        query: 'title:"Native image resize"',
      })
    ).data?.[0]?.body.includes('width:30%'),
  );
  await page.select('select[aria-label="Tamaño de imagen"]', 'auto');
  await page.waitForFunction(
    () => document.querySelector('.mde-preview img')?.style.width === '',
  );
  await page.focus('.cm-content');
  await page.keyboard.down(modifier);
  await page.keyboard.press(
    process.platform === 'darwin' ? 'ArrowDown' : 'End',
  );
  await page.keyboard.up(modifier);
  await page.keyboard.sendCharacter('\n\nPasted local image:\n');
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    document.querySelector('.cm-content').dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.mde-preview img').length === 2 &&
      [...document.querySelectorAll('.mde-preview img')].every(
        (image) => image.naturalWidth > 0,
      ),
  );
  console.log(
    'Official themes, installed CSS protocol, styles.css hot reload and native image resizing passed.',
  );

  const fixtures = await page.evaluate(async () => {
    const book = await window.inkNote.library.createNotebook({
      name: 'Native features',
    });
    const metadata = {
      notebookId: book.data.id,
      tags: ['native-feature'],
      status: 'none',
      isTemplate: false,
    };
    await window.inkNote.notes.create({
      title: 'Native open scope',
      body: 'Open marker',
      metadata,
    });
    const finished = await window.inkNote.notes.create({
      title: 'Native completed scope',
      body: 'Finished marker',
      metadata: { ...metadata, status: 'completed' },
    });
    await window.inkNote.notes.create({
      title: 'Native outside marker',
      body: 'Outside marker',
      metadata: { ...metadata, notebookId: null },
    });
    await window.inkNote.notes.create({
      title: 'Native template',
      body: `---\n_template:\n  title: "{{ 'now' | date: '%Y-%m-%d' }} Native report"\n  tags: [from-template]\n  status: active\n---\n\n> # !Instructions\n> Hidden guidance.\n\n## Native generated\n\n{% uuid %}\n`,
      metadata: { ...metadata, notebookId: null, isTemplate: true },
    });
    return { book: book.data.id, finished: finished.data.id };
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.notebook-select')].some((element) =>
      element.textContent.includes('Native features'),
    ),
  );
  await clickText('.notebook-select', 'Native features');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.note-list-item')].some((element) =>
        element.textContent.includes('Native open scope'),
      ) &&
      ![...document.querySelectorAll('.note-list-item')].some((element) =>
        element.textContent.includes('Native completed scope'),
      ),
  );
  await page.type('#note-search', 'status:completed tag:native-feature');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.note-list-item')].some((element) =>
      element.textContent.includes('Native completed scope'),
    ),
  );
  await page.focus('#note-search');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.querySelector('#note-search').value === '',
  );
  await page.keyboard.down(modifier);
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('f');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up(modifier);
  await page.keyboard.sendCharacter('title:"Native outside marker"');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.note-list-item')].some((element) =>
      element.textContent.includes('Native outside marker'),
    ),
  );
  await page.keyboard.press('Escape');
  await clickText('.navigation-item', 'Todas las notas');
  await page.click('button[aria-label="Nueva nota"]');
  await page.waitForSelector('.empty-note-actions button');
  await chooseNoteStatus(page, 'onhold');
  await page.type('input[aria-label="Añadir etiqueta"]', 'retained');
  await page.click('.empty-note-actions button');
  await page.waitForSelector('.template-picker-dialog [role="option"]');
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll('.template-picker-dialog [role="option"]'),
    ].some((element) => element.textContent.includes('Native template')),
  );
  await clickText('.template-picker-dialog [role="option"]', 'Native template');
  await clickText(
    '.template-picker-dialog .dialog-actions button',
    'Aplicar plantilla',
  );
  await page.waitForFunction(() =>
    document
      .querySelector('.document-title-input')
      ?.value.endsWith('Native report'),
  );
  await page.waitForFunction(async () => {
    const note = (
      await window.inkNote.notes.search({ query: 'title:"Native report"' })
    ).data?.[0];
    return (
      note?.body.includes('Native generated') &&
      !note.body.includes('Instructions') &&
      note.metadata.status === 'onhold' &&
      note.metadata.tags.includes('retained') &&
      note.metadata.tags.includes('from-template')
    );
  });
  await page.focus('.note-list-item[aria-current="true"]');
  await page.keyboard.press('p');
  await page.waitForFunction(
    async () =>
      (await window.inkNote.notes.search({ query: 'title:"Native report"' }))
        .data?.[0]?.isPinned,
  );
  await page.screenshot({ path: path.join(profile, 'native-template.png') });
  await clickText('.navigation-item', 'Papelera');
  await page.focus('#note-search');
  await page.keyboard.down(modifier);
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('f');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up(modifier);
  await page.keyboard.sendCharacter('title:"Native outside marker"');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.note-list-item')].some((element) =>
      element.textContent.includes('Native outside marker'),
    ),
  );
  await clickText('.note-list-item', 'Native outside marker');
  assert.equal(
    await page.$eval('.document-title-input', (input) => input.disabled),
    false,
    'Live results from global search must remain editable after leaving Trash.',
  );
  await page.focus('#note-search');
  await page.keyboard.press('Escape');
  await clickText('.navigation-item', 'Todas las notas');
  assert.ok(fixtures.finished);
  console.log(
    'Notebook finished filters, qualified/global search, template metadata, instructions and pin shortcut passed.',
  );
  await settle();
  await clickText('.note-list-item', 'Automatic title');
}
