import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { DatabaseSync } from 'node:sqlite';
import { verifyInkdropFeatures } from './smoke-inkdrop-features.mjs';
import { verifyEditorLayout } from './smoke-editor-layout.mjs';
import { verifyLineWrapping } from './smoke-line-wrapping.mjs';
import { verifyEnterScroll } from './smoke-enter-scroll.mjs';
import { verifyScrollReflow } from './smoke-scroll-reflow.mjs';
import { verifyNotebookNavigation } from './smoke-notebook-navigation.mjs';
import {
  chooseNoteStatus,
  verifyStatusAndAlerts,
} from './smoke-status-alerts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = process.argv
  .find((argument) => argument.startsWith('--app-path='))
  ?.slice('--app-path='.length);
const packaged = process.argv.includes('--packaged') || !!appPath;
const reviewDatabase = process.argv
  .find((argument) => argument.startsWith('--notes-database='))
  ?.slice('--notes-database='.length);
const profile = await mkdtemp(path.join(tmpdir(), 'inknote-electron-smoke-'));
const { productName } = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const bundle = path.join(
  root,
  'out',
  `${productName}-${process.platform}-${process.arch}`,
);
const binary = appPath
  ? process.platform === 'darwin' && appPath.endsWith('.app')
    ? path.join(appPath, 'Contents', 'MacOS', productName)
    : appPath
  : process.platform === 'darwin'
    ? path.join(bundle, `${productName}.app`, 'Contents', 'MacOS', productName)
    : path.join(
        bundle,
        `${productName}${process.platform === 'win32' ? '.exe' : ''}`,
      );
const flags = [
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=0',
  '--enable-logging=stderr',
  ...(process.env.CI === 'true' ? ['--disable-gpu'] : []),
];
const child = spawn(
  packaged ? binary : process.execPath,
  packaged
    ? flags
    : [
        path.join(
          root,
          'node_modules/@electron-forge/cli/dist/electron-forge.js',
        ),
        'start',
        '--',
        ...flags,
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
    protocolTimeout:
      process.env.CI === 'true' ||
      process.argv.includes('--catalog') ||
      process.argv.includes('--emulated')
        ? 60_000
        : 15_000,
  });
  const target = await browser.waitForTarget(
    (target) =>
      target.type() === 'page' && /^(file:|https?:)/.test(target.url()),
  );
  page = await target.page();
  // Keep native macOS occlusion from suspending frame-based UI assertions.
  // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setFocusEmulationEnabled
  await (
    await page.createCDPSession()
  ).send('Emulation.setFocusEmulationEnabled', { enabled: true });
  page.setDefaultTimeout(
    process.env.CI === 'true' || process.argv.includes('--emulated')
      ? 30_000
      : 10_000,
  );
  page.setDefaultNavigationTimeout(
    process.env.CI === 'true' || process.argv.includes('--emulated')
      ? 60_000
      : 30_000,
  );
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.evaluateOnNewDocument(() => {
    window.__smokeCsp = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__smokeCsp.push(event.violatedDirective),
    );
  });
  await page.waitForSelector('.inknote-shell', { timeout: 10_000 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.inknote-shell', { timeout: 10_000 });
  await page.waitForFunction(() => {
    const icon = document.querySelector('.app-wordmark img');
    return (
      icon instanceof HTMLImageElement &&
      icon.complete &&
      icon.naturalWidth === 64 &&
      !!document.querySelector('link[rel="icon"][type="image/png"]')
    );
  });
  assert.equal(
    await page.$eval(
      '.inknote-shell',
      (element) => getComputedStyle(element).display,
    ),
    'flex',
    'The real Electron CSP must allow the shell stylesheet.',
  );
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).margin),
    '0px',
  );
  const initial = await page.evaluate(() => window.inkNote.notes.list());
  assert.equal(
    initial.ok,
    true,
    'The real preload and SQLite IPC must respond.',
  );
  assert.equal(
    initial.data.length,
    0,
    'Smoke tests must only mutate a fresh temporary profile.',
  );
  await page.screenshot({ path: path.join(profile, 'initial-shell.png') });
  await page.click('button[aria-label="Nueva nota"]');
  await page.waitForSelector('.cm-content');
  await page.focus('.cm-content');
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const shortcut = async (key) => {
    await page.keyboard.down(modifier);
    await page.keyboard.press(key);
    await page.keyboard.up(modifier);
  };
  await page.keyboard.sendCharacter('10. Parent\n- Child');
  await page.keyboard.press('Tab');
  await page.waitForSelector('.mde-preview ol li ul li');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  await page.waitForSelector('.mde-preview > ul > li');
  await page.keyboard.sendCharacter('\n\nToggle');
  await page.keyboard.down('Shift');
  for (const _ of 'Toggle') await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.waitForSelector(
    '.inknote-floating-format button[aria-label="Negrita"]',
  );
  await shortcut('b');
  await page.waitForSelector('.mde-preview strong');
  await shortcut('b');
  await page.waitForSelector('.mde-preview strong', { hidden: true });
  await shortcut('k');
  await page.waitForSelector('dialog[aria-label="Comandos"] input');
  await page.type('dialog[aria-label="Comandos"] input', 'cursiva');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.mde-preview em');
  await shortcut('i');
  await page.waitForSelector('.mde-preview em', { hidden: true });
  await page.waitForFunction(async () => {
    const result = await window.inkNote.notes.list();
    return (
      result.ok && result.data[0]?.body === '10. Parent\n- Child\n\nToggle'
    );
  });
  console.log(
    'Native list hierarchy, format toggles, command palette, preview and autosave passed.',
  );
  await shortcut('a');
  const body =
    '## Comprobacion nativa\n\n- [ ] Tarea interactiva\n\n' +
    Array.from(
      { length: 80 },
      (_, index) =>
        `## Block ${index}\n\n${'Paragraph with **Markdown** and source mapping. '.repeat(5)}\n\n\`\`\`js\nconst block = ${index};\n\`\`\`\n\n`,
    ).join('') +
    'Nota guardada desde Electron.';
  await page.keyboard.sendCharacter(body);
  await page.waitForFunction(async () => {
    const result = await window.inkNote.notes.list();
    return (
      result.ok &&
      result.data[0]?.body.includes('Nota guardada desde Electron.')
    );
  });
  await page.waitForSelector('.mde-preview h2');
  await page.focus('.cm-content');
  await page.keyboard.down(modifier);
  await page.keyboard.press('f');
  await page.keyboard.up(modifier);
  await page.waitForSelector('.cm-search input[name="search"]');
  await page.type('.cm-search input[name="search"]', 'Block 10');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cm-search', { hidden: true });
  console.log('Native autosave passed; checking task editing.');
  await page.click('.mde-preview input[type="checkbox"]');
  await page.waitForFunction(async () => {
    const result = await window.inkNote.notes.list();
    return (
      result.ok && result.data[0]?.body.includes('- [x] Tarea interactiva')
    );
  });
  await page.evaluate(() => {
    document.querySelector('.cm-scroller').scrollTop = 0;
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.cm-line')].some((element) =>
      element.textContent.includes('[x]'),
    ),
  );
  await page.focus('.cm-content');
  await page.keyboard.down(modifier);
  await page.keyboard.press('z');
  await page.keyboard.up(modifier);
  await page.waitForFunction(
    () =>
      !document.querySelector('.mde-preview input[type="checkbox"]').checked,
  );
  await page.click('input[aria-label="Título de la nota"]');
  console.log('Native checkbox and undo passed; checking metadata autosave.');
  await page.$eval('input[aria-label="Título de la nota"]', (element) =>
    element.select(),
  );
  await page.keyboard.type('Automatic title ');
  await page.waitForFunction(async () => {
    const result = await window.inkNote.notes.list();
    return result.ok && result.data[0]?.title === 'Automatic title ';
  });
  await page.click('button[aria-label="Nuevo notebook"]');
  await page.type('dialog input', 'Native notebook');
  await page.click('dialog .button--primary');
  await page.waitForSelector('.empty-list-state');
  await page.click('button[aria-label="Cambiar icono de Native notebook"]');
  await page.click('button[aria-label="Usar icono Trabajo"]');
  await page.waitForFunction(
    async () =>
      (await window.inkNote.library.get()).data.notebooks.find(
        (book) => book.name === 'Native notebook',
      ).icon === 'briefcase',
  );
  await page.click('dialog button[aria-label="Cerrar diálogo"]');
  await page.click('.navigation-item');
  await page.waitForSelector('.cm-content');
  const notebook = await page.evaluate(async () => {
    const result = await window.inkNote.library.get();
    return result.data.notebooks[0].id;
  });
  await page.click('button[aria-label^="Notebook de la nota:"]');
  await page.click('.notebook-picker-option[aria-label="Native notebook"]');
  await chooseNoteStatus(page, 'onhold');
  await page.type('input[aria-label="Añadir etiqueta"]', 'native-tag');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    async (notebook) => {
      const result = await window.inkNote.notes.list();
      return (
        result.ok &&
        result.data[0]?.metadata?.notebookId === notebook &&
        result.data[0]?.metadata?.status === 'onhold' &&
        result.data[0]?.metadata?.tags.includes('native-tag')
      );
    },
    {},
    notebook,
  );
  await verifyNotebookNavigation({ page, profile, notebookId: notebook });
  await verifyStatusAndAlerts({ page, profile });
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setTimeout(resolve, 100)),
          ),
        ),
    );
  const visibleBlocks = () =>
    page.evaluate(() => {
      const first = (selector, container) => {
        const bounds = document
          .querySelector(container)
          .getBoundingClientRect();
        for (const node of document.querySelectorAll(selector)) {
          const rect = node.getBoundingClientRect(),
            match = node.textContent.match(/(?:## )?Block (\d+)/);
          if (match && rect.bottom > bounds.top && rect.top < bounds.bottom)
            return Number(match[1]);
        }
        return null;
      };
      return {
        editor: first('.cm-line', '.cm-scroller'),
        preview: first('.mde-preview h2', '.pane--preview'),
      };
    });
  await page.evaluate(() => {
    document.activeElement.blur();
    const element = document.querySelector('.cm-scroller');
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.55;
  });
  await settle();
  let blocks = await visibleBlocks();
  console.log('Editor to preview:', blocks);
  assert.ok(
    blocks.editor !== null &&
      blocks.preview !== null &&
      Math.abs(blocks.editor - blocks.preview) <= 1,
    JSON.stringify(blocks),
  );
  await page.evaluate(() => {
    const element = document.querySelector('.pane--preview');
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.3;
  });
  await settle();
  blocks = await visibleBlocks();
  console.log('Preview to editor:', blocks);
  assert.ok(
    blocks.editor !== null &&
      blocks.preview !== null &&
      Math.abs(blocks.editor - blocks.preview) <= 1,
    JSON.stringify(blocks),
  );
  const positions = await page.evaluate(() => [
    document.querySelector('.cm-scroller').scrollTop,
    document.querySelector('.pane--preview').scrollTop,
  ]);
  await settle();
  const stable = await page.evaluate(() => [
    document.querySelector('.cm-scroller').scrollTop,
    document.querySelector('.pane--preview').scrollTop,
  ]);
  assert.ok(
    stable.every((value, index) => Math.abs(value - positions[index]) < 2),
    'Scroll sync must settle without feedback loops.',
  );
  const primaryNoteId = await page.evaluate(
    async () => (await window.inkNote.notes.list()).data[0].id,
  );
  assert.equal(
    await page.$eval(
      '.navigation-item.status-onhold .navigation-count',
      (element) => element.textContent,
    ),
    '1',
  );
  assert.ok(
    await page.$$eval('.navigation-item .navigation-count', (counters) => {
      const edge = document
        .querySelector('.pane--sidebar')
        .getBoundingClientRect().right;
      return counters.every(
        (counter) =>
          counter.getBoundingClientRect().right <= edge + 1 &&
          counter.getBoundingClientRect().width > 0 &&
          getComputedStyle(counter).visibility === 'visible',
      );
    }),
    'Sidebar counters must remain visible inside the panel. ' +
      JSON.stringify(
        await page.$$eval('.navigation-item .navigation-count', (counters) =>
          counters.map((counter) => ({
            label: counter.parentElement.textContent,
            right: counter.getBoundingClientRect().right,
            width: counter.getBoundingClientRect().width,
            visibility: getComputedStyle(counter).visibility,
            edge: document
              .querySelector('.pane--sidebar')
              .getBoundingClientRect().right,
          })),
        ),
      ),
  );
  await page.evaluate(async (parentId) => {
    const child = await window.inkNote.library.createNotebook({
      name: 'Rendering child',
      parentId,
    });
    const note = await window.inkNote.notes.create({
      title: 'Math and Mermaid native',
      body: 'Inline $O(n \\times m)$.\n\n$$\n\\frac{n}{v} \\approx 127\n$$\n\n```math\n\\sum_{i=1}^{n} i\n```\n\n```mermaid\nflowchart TD\n A[Start] --> B{Ready?}\n B -->|Yes| C[Ship]\n B -->|No| D[Fix]\n D --> B\n```',
      metadata: {
        notebookId: child.data.id,
        tags: ['rendering'],
        status: 'active',
        isTemplate: false,
      },
    });
    return { id: note.data.id, childId: child.data.id };
  }, notebook);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.note-list-item')].some((element) =>
      element.textContent.includes('Math and Mermaid native'),
    ),
  );
  await page.$$eval('.note-list-item', (elements) =>
    elements
      .find((element) =>
        element.textContent.includes('Math and Mermaid native'),
      )
      .click(),
  );
  await page.waitForSelector('.mermaid-block svg');
  await page.waitForFunction(
    () => document.querySelectorAll('.inkdrop-math math').length === 3,
  );
  assert.ok(
    await page.$eval(
      '.inkdrop-math .katex',
      (element) => element.getBoundingClientRect().height > 10,
    ),
  );
  assert.ok(
    await page.evaluate(() => document.fonts.check('16px KaTeX_Main')),
    'KaTeX WOFF2 fonts must load locally under CSP.',
  );
  await page.hover('.mermaid-block');
  await page.click('.mermaid-block button[aria-label="Pantalla completa"]');
  await page.waitForSelector('.diagram-dialog .mermaid-diagram svg');
  const svgSelector = '.diagram-dialog .mermaid-diagram svg';
  const initialBox = await page.$eval(svgSelector, (element) =>
    element.getAttribute('viewBox'),
  );
  const svg = await page.$(svgSelector);
  const box = await svg.boundingBox();
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const devtools = await page.createCDPSession();
  await devtools.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    ...center,
    deltaX: 0,
    deltaY: -160,
    modifiers: 2,
  });
  await page.waitForFunction(
    (selector, before) =>
      document.querySelector(selector).getAttribute('viewBox') !== before,
    {},
    svgSelector,
    initialBox,
  );
  const zoomed = await page.$eval(svgSelector, (element) =>
    element.getAttribute('viewBox'),
  );
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 45, center.y + 35, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    (selector, before) =>
      document.querySelector(selector).getAttribute('viewBox') !== before,
    {},
    svgSelector,
    zoomed,
  );
  await page.click('.diagram-dialog button[aria-label="Restablecer zoom"]');
  await page.waitForFunction(
    (selector, before) =>
      document.querySelector(selector).getAttribute('viewBox') === before,
    {},
    svgSelector,
    initialBox,
  );
  await page.screenshot({ path: path.join(profile, 'mermaid-fullscreen.png') });
  await page.click('.diagram-dialog button[aria-label="Cerrar diálogo"]');
  const updatedDiagramBody = await page.evaluate(async () =>
    (await window.inkNote.notes.list()).data
      .find((note) => note.title === 'Math and Mermaid native')
      .body.replace('A[Start]', () => 'A["$$E=mc^2$$"]')
      .replace('C[Ship]', 'C[Released]'),
  );
  await page.focus('.cm-content');
  await page.keyboard.down(modifier);
  await page.keyboard.press('a');
  await page.keyboard.up(modifier);
  await page.keyboard.sendCharacter(updatedDiagramBody);
  await page.waitForFunction(() =>
    document
      .querySelector('.mermaid-block svg')
      ?.textContent.includes('Released'),
  );
  await page.waitForSelector('.mermaid-block svg math');
  await page.$$eval(
    '.notebook-detail',
    (elements) =>
      elements
        .find(
          (element) =>
            element.getAttribute('aria-label') === 'Detail de Native notebook',
        )
        .click(),
    notebook,
  );
  await page.waitForSelector('[aria-label="Ruta del notebook"]');
  await page.waitForFunction(() =>
    document
      .querySelector('.note-list-footer')
      .textContent.trim()
      .startsWith('2 notas'),
  );
  await page.click('button[aria-label="Detail de Rendering child"]');
  await page.waitForFunction(() =>
    document
      .querySelector('.note-list-footer')
      .textContent.trim()
      .startsWith('1 nota'),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Ruta del notebook"]')
        .textContent.includes('Native notebook') &&
      document
        .querySelector('[aria-label="Ruta del notebook"]')
        .textContent.includes('Rendering child'),
  );
  await page.click('button[aria-label="Volver a biblioteca"]');
  await page.waitForFunction(() =>
    document
      .querySelector('.note-list-footer')
      .textContent.trim()
      .startsWith('2 notas'),
  );
  await page.$$eval('.note-list-item', (elements) =>
    elements
      .find((element) => element.textContent.includes('Automatic title'))
      .click(),
  );
  console.log(
    'Native math, live Mermaid with math labels, pinch/pan/reset, icons, real counts, Detail and breadcrumbs passed.',
  );
  await verifyInkdropFeatures({
    page,
    profile,
    modifier,
    settle,
    catalogEnabled: process.argv.includes('--catalog'),
  });
  await verifyEditorLayout(page);
  await verifyLineWrapping(page);
  await verifyEnterScroll({ page, profile });
  await verifyScrollReflow({ page, profile });
  if (reviewDatabase) {
    const source = new DatabaseSync(reviewDatabase, { readOnly: true });
    let notes;
    try {
      notes = source
        .prepare(
          'SELECT id,title,body FROM notes WHERE deleted_at IS NULL ORDER BY created_at,id',
        )
        .all();
    } finally {
      source.close();
    }
    for (const note of notes) {
      await page.evaluate(
        async ({ title, body }) => {
          const result = await window.inkNote.notes.create({ title, body });
          if (!result.ok)
            throw new Error('Could not create isolated review copy.');
        },
        { title: note.title, body: note.body },
      );
      await page.waitForFunction(
        (title) =>
          [...document.querySelectorAll('.note-row-title')].some(
            (element) => element.textContent === title,
          ),
        {},
        note.title,
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
        note.title,
      );
      await page.waitForFunction(
        (title) =>
          document.querySelector('.document-title-input').value === title,
        {},
        note.title,
      );
      if (note.body.includes('$') || note.body.includes('```math'))
        await page.waitForSelector('.inkdrop-math math');
      if (note.body.includes('```mermaid'))
        await page.waitForSelector('.mermaid-block svg');
      assert.equal(
        await page
          .$$('.inkdrop-math-error')
          .then((elements) => elements.length),
        0,
        `Invalid formula in ${note.title}`,
      );
      await settle();
      await page.screenshot({
        path: path.join(profile, `review-${note.id}.png`),
      });
    }
    console.log(
      `Reviewed ${notes.length} user notes in isolated copies; source database opened read-only.`,
    );
    await page.$$eval('.note-list-item', (elements) =>
      elements
        .find((element) => element.textContent.includes('Automatic title'))
        .click(),
    );
  }
  await page.click('button[aria-label="Preferencias"]');
  await page.click('[role="tab"][id="settings-tab-themes"]');
  await page.select('select[aria-label="Tema"]', 'inknote-dark');
  await page.screenshot({ path: path.join(profile, 'preferences.png') });
  await page.waitForFunction(async () => {
    const result = await window.inkNote.preferences.get();
    return result.ok && result.data.preferences.theme === 'inknote-dark';
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.theme === 'inknote-dark' &&
      getComputedStyle(document.documentElement).colorScheme === 'dark',
  );
  await page.waitForSelector('.cm-content');
  await page.$$eval('.note-list-item', (elements) =>
    elements
      .find((element) => element.textContent.includes('Automatic title'))
      .click(),
  );
  await page.waitForFunction(
    () =>
      document.querySelector('.mde-preview h2')?.textContent ===
      'Comprobacion nativa',
  );
  assert.equal(
    await page.$eval('.mde-preview h2', (element) => element.textContent),
    'Comprobacion nativa',
  );
  assert.deepEqual(await page.evaluate(() => window.__smokeCsp), []);
  assert.deepEqual(errors, []);
  const screenshot = path.join(profile, 'shell.png');
  await page.screenshot({ path: screenshot });
  await page.focus('.cm-content');
  await page.keyboard.down(modifier);
  await page.keyboard.press(
    process.platform === 'darwin' ? 'ArrowDown' : 'End',
  );
  await page.keyboard.up(modifier);
  await page.keyboard.sendCharacter('\n\nClose flush sentinel');
  await browser.close();
  browser = undefined;
  const database = new DatabaseSync(path.join(profile, 'inknote-v2.sqlite'), {
    readOnly: true,
  });
  try {
    assert.ok(
      database
        .prepare('SELECT body FROM notes WHERE id = ?')
        .get(primaryNoteId)
        .body.includes('Close flush sentinel'),
      'Closing must flush the last edit before the debounce expires.',
    );
  } finally {
    database.close();
  }
  console.log(
    `${packaged ? 'Packaged' : 'Development'} Electron: autosave, metadata, interactive tasks, undo, two-way source scroll, close flush, themes and CSP passed.\nScreenshot: ${screenshot}`,
  );
} catch (error) {
  console.error('Renderer errors:', errors);
  if (page)
    console.error(
      'Renderer state:',
      await page
        .evaluate(() => ({
          url: location.href,
          ready: document.readyState,
          root: document.querySelector('#root')?.innerHTML.slice(0, 500),
          scripts: [...document.scripts].map((s) => s.src),
          bridge: typeof window.inkNote,
          previewLength:
            document.querySelector('.mde-preview')?.textContent.length,
          editorLength:
            document.querySelector('.cm-content')?.textContent.length,
          resources: performance
            .getEntriesByType('resource')
            .slice(0, 10)
            .map((r) => ({ name: r.name, size: r.encodedBodySize })),
        }))
        .catch(() => null),
    );
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
