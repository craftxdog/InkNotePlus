import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');
const profile = await mkdtemp(path.join(tmpdir(), 'inknote-electron-smoke-'));
const { productName } = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const bundle = path.join(
  root,
  'out',
  `${productName}-${process.platform}-${process.arch}`,
);
const binary =
  process.platform === 'darwin'
    ? path.join(bundle, `${productName}.app`, 'Contents', 'MacOS', productName)
    : path.join(
        bundle,
        `${productName}${process.platform === 'win32' ? '.exe' : ''}`,
      );
const flags = [
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=0',
  '--enable-logging=stderr',
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
    protocolTimeout: 15000,
  });
  const target = await browser.waitForTarget(
    (target) =>
      target.type() === 'page' && /^(file:|https?:)/.test(target.url()),
  );
  page = await target.page();
  page.setDefaultTimeout(10000);
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
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
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
  await page.click('.navigation-item');
  await page.waitForSelector('.cm-content');
  const notebook = await page.evaluate(async () => {
    const result = await window.inkNote.library.get();
    return result.data.notebooks[0].id;
  });
  await page.select('select[aria-label="Notebook de la nota"]', notebook);
  await page.select('select[aria-label="Estado de la nota"]', 'onhold');
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
  await page.click('button[aria-label="Preferencias"]');
  await page.select('select[aria-label="Tema"]', 'inknote-dark');
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
        .prepare('SELECT body FROM notes LIMIT 1')
        .get()
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
