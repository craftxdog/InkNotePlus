import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

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
  });
  const target = await browser.waitForTarget(
    (target) =>
      target.type() === 'page' && /^(file:|https?:)/.test(target.url()),
  );
  page = await target.page();
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
  await page.click('.cm-content');
  await page.keyboard.type(
    '## Comprobacion nativa\n\nNota guardada desde Electron.',
  );
  await page.click('button[aria-label="Guardar"]');
  await page.waitForFunction(async () => {
    const result = await window.inkNote.notes.list();
    return (
      result.ok &&
      result.data[0]?.body.includes('Nota guardada desde Electron.')
    );
  });
  await page.waitForSelector('.mde-preview h2');
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
  console.log(
    `${packaged ? 'Packaged' : 'Development'} Electron: shell CSS, real preload/IPC, SQLite save, CodeMirror, preview, theme persistence and CSP passed.\nScreenshot: ${screenshot}`,
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
  await browser?.close().catch(() => {});
  if (child.exitCode === null) {
    if (process.platform === 'win32') child.kill();
    else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    }
  }
}
