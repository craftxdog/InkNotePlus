import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';

const themes = [
  'inknote-light',
  'inknote-dark',
  'solarized-light',
  'solarized-dark',
  'kanagawa-wave',
  'kanagawa-dragon',
  'kanagawa-lotus',
];

const settle = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });

// Measure computed colors after alpha compositing, including modal backdrops.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
export function inspectText() {
  const canvas = document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true });
  const rgba = (value) => {
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = value;
    canvas.fillRect(0, 0, 1, 1);
    return [...canvas.getImageData(0, 0, 1, 1).data].map((value, index) =>
      index === 3 ? value / 255 : value,
    );
  };
  const composite = (front, back) =>
    front
      .slice(0, 3)
      .map((value, index) => value * front[3] + back[index] * (1 - front[3]));
  const luminance = (color) =>
    color.reduce((sum, channel, index) => {
      const value = channel / 255;
      const linear =
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  const result = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const element = node.parentElement;
    if (
      element.closest(
        'script, style, [aria-hidden=true], :disabled, .visually-hidden, .katex-mathml',
      )
    )
      continue;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (
      !box.width ||
      !box.height ||
      box.bottom < 0 ||
      box.top > innerHeight ||
      style.visibility !== 'visible'
    )
      continue;
    const hit = document.elementFromPoint(
      Math.max(0, Math.min(innerWidth - 1, box.left + box.width / 2)),
      Math.max(0, Math.min(innerHeight - 1, box.top + box.height / 2)),
    );
    if (!hit || !(element.contains(hit) || hit.contains(element))) continue;
    const ancestors = [];
    for (let parent = element; parent; parent = parent.parentElement)
      ancestors.unshift(parent);
    let background = [255, 255, 255];
    for (const parent of ancestors)
      background = composite(
        rgba(getComputedStyle(parent).backgroundColor),
        background,
      );
    const foreground = composite(rgba(style.color), background);
    const levels = [luminance(foreground), luminance(background)].sort(
      (a, b) => b - a,
    );
    const ratio = (levels[0] + 0.05) / (levels[1] + 0.05);
    const size = Number.parseFloat(style.fontSize);
    const required =
      size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
        ? 3
        : 4.5;
    result.push({
      text: node.textContent.trim().slice(0, 70),
      selector: element.className || element.tagName,
      color: style.color,
      background,
      ratio: Math.round(ratio * 100) / 100,
      required,
      font: style.fontFamily,
    });
  }
  return result;
}

function inspectThemeTokens() {
  const style = document.querySelector('style[data-theme-contrast]');
  const rules = style?.textContent;
  const sheet = style?.sheet;
  if (sheet) sheet.disabled = true;
  const root = getComputedStyle(document.documentElement);
  const tokens = {};
  const probe = document.createElement('span');
  document.documentElement.append(probe);
  try {
    for (const name of [
      '--page-background',
      '--text-color',
      '--muted-text-color',
      '--input-background',
      '--popup-background',
      '--sidebar-background',
      '--note-list-bar-background',
      '--editor-background',
      '--preferences-sidebar-background',
    ]) {
      probe.style.color = `var(${name})`;
      probe.style.background = `var(${name})`;
      const measured = getComputedStyle(probe);
      tokens[name] = {
        raw: root.getPropertyValue(name),
        color: measured.color,
        background: measured.backgroundColor,
      };
    }
    return { scheme: root.colorScheme, rules, tokens };
  } finally {
    probe.remove();
    if (sheet) sheet.disabled = false;
  }
}

export async function verifySidebarShortcuts(page) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const before = await page.$eval(
    '.inknote-shell',
    (element) => element.dataset.sidebarVisible,
  );
  for (const visible of [before !== 'true', before === 'true']) {
    await page.keyboard.down(modifier);
    await page.keyboard.press('/');
    await page.keyboard.up(modifier);
    await page.waitForFunction(
      (visible) =>
        document.querySelector('.inknote-shell').dataset.sidebarVisible ===
        String(visible),
      { timeout: 3000 },
      visible,
    );
  }
}

export async function verifySystemAudit({ page, profile }) {
  const fixture = await page.evaluate(async () => {
    const body =
      '# Audit heading\n\nNormal **bold** *italic* ~~deleted~~ <mark>highlight</mark> [link](https://docs.inkdrop.app/start-guide)\n\n- [ ] Task unchecked\n- [x] Task checked\n\n> [!NOTE]\n> Note content\n\n> [!WARNING]\n> Warning content\n\n```js\nconst text = "syntax colors";\n```\n\n| Name | Value |\n| --- | --- |\n| table | cell |\n';
    const colors = [
      'default',
      'red',
      'orange',
      'yellow',
      'olive',
      'green',
      'teal',
      'blue',
      'violet',
      'purple',
      'pink',
      'brown',
      'grey',
      'black',
    ];
    const note = await window.inkNote.notes.create({
      title: 'System audit',
      body,
      metadata: {
        notebookId: null,
        status: 'active',
        isTemplate: false,
        tags: colors.map((color) => `${color} tag`),
      },
    });
    if (!note.ok) throw new Error('Cannot create the audit note.');
    for (const color of colors) {
      const result = await window.inkNote.library.updateTag({
        name: `${color} tag`,
        nextName: `${color} tag`,
        color,
      });
      if (!result.ok) throw new Error('Cannot configure the audit tag color.');
    }
    await window.inkNote.notes.create({
      title: 'Another note',
      body: 'Other body',
    });
    return note.data;
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.note-list-item').length === 2,
  );
  await page.$$eval('.note-list-item', (items) =>
    items.find((item) => item.textContent.includes('System audit')).click(),
  );
  await page.waitForSelector('.mde-preview h1');
  const report = {};
  for (const theme of themes) {
    await page.click('button[aria-label="Preferencias"]');
    await page.click('#settings-tab-themes');
    await page.select('select[aria-label="Tema"]', theme);
    await page.waitForFunction(
      (name) => document.documentElement.dataset.theme === name,
      {},
      theme,
    );
    await settle(page);
    const settings = await page.evaluate(inspectText);
    for (const tab of [
      'general',
      'editing',
      'preview',
      'keybindings',
      'backup',
    ]) {
      await page.click(`#settings-tab-${tab}`);
      await settle(page);
      settings.push(...(await page.evaluate(inspectText)));
    }
    await page.click('button[aria-label="Cerrar diálogo"]');
    await settle(page);
    const workspace = await page.evaluate(inspectText);
    report[theme] = {
      settings,
      workspace,
      computed: await page.evaluate(inspectThemeTokens),
    };
    await page.screenshot({ path: path.join(profile, `audit-${theme}.png`) });
  }
  await writeFile(
    path.join(profile, 'theme-audit.json'),
    JSON.stringify(report, null, 2),
  );
  for (const [theme, areas] of Object.entries(report)) {
    const findings = [...areas.settings, ...areas.workspace].filter(
      (item) => item.ratio < item.required,
    );
    console.log(
      `${theme}: ${findings.length} contrast findings`,
      JSON.stringify(findings.slice(0, 10)),
    );
    assert.equal(
      findings.length,
      0,
      `${theme} must keep visible text readable. See theme-audit.json for every finding.`,
    );
  }
  await page.click('button[aria-label="Preferencias"]');
  await page.click('#settings-tab-themes');
  await page.select('select[aria-label="Tema"]', 'inknote-dark');
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === 'inknote-dark',
  );
  await page.click('button[aria-label="Cerrar diálogo"]');
  await page.focus('.cm-content');
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.down(modifier);
  await page.keyboard.press(
    process.platform === 'darwin' ? 'ArrowDown' : 'End',
  );
  await page.keyboard.up(modifier);
  const marker = '\n\nReload flush audit';
  const startupObserver = await page.evaluateOnNewDocument(() => {
    const frames = [];
    window.__inkNoteStartupFrames = frames;
    const sample = () => {
      const root = document.querySelector('#root');
      const theme = document.documentElement.dataset.theme;
      frames.push({
        theme,
        background: getComputedStyle(document.documentElement).backgroundColor,
        visible:
          !!root?.firstElementChild &&
          getComputedStyle(root).visibility === 'visible',
      });
      if (!theme && frames.length < 240) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.keyboard.sendCharacter(marker);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    (async () => {
      await page.keyboard.down(modifier);
      await page.keyboard.press('r');
      await page.keyboard.up(modifier);
    })(),
  ]);
  await page.waitForFunction(
    (title) => document.querySelector('.document-title-input')?.value === title,
    {},
    fixture.title,
  );
  await page.waitForFunction(
    (text) =>
      document.querySelector('.mde-preview')?.textContent.includes(text),
    {},
    marker.trim(),
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    'inknote-dark',
  );
  const startupFrames = await page.evaluate(
    () => window.__inkNoteStartupFrames,
  );
  await page.removeScriptToEvaluateOnNewDocument(startupObserver.identifier);
  assert.ok(
    startupFrames.length > 0 &&
      startupFrames.every(
        (frame) =>
          frame.background !== 'rgb(255, 255, 255)' &&
          (!frame.visible || frame.theme === 'inknote-dark'),
      ),
    `Reload must not expose an unthemed or white workspace: ${JSON.stringify(startupFrames)}`,
  );
  const persisted = await page.evaluate(
    (id) => window.inkNote.notes.list({ id }),
    fixture.id,
  );
  assert.ok(
    persisted.ok && persisted.data[0].body.endsWith(marker),
    'Cmd+R must flush the pending edit before reloading.',
  );
  const delay = [];
  await settle(page);
  let expected = marker.trim();
  await page.focus('.cm-content');
  for (let index = 0; index < 12; index++) {
    expected += 'x';
    const started = performance.now();
    await page.keyboard.sendCharacter('x');
    await page.waitForFunction(
      (text) =>
        document.querySelector('.mde-preview')?.textContent.includes(text),
      {},
      expected,
    );
    delay.push(Math.round(performance.now() - started));
  }
  console.log('Typing to preview latency (ms):', JSON.stringify(delay));
  const layouts = [];
  for (const [width, height] of [
    [640, 480],
    [800, 560],
    [1280, 800],
    [1920, 1080],
  ]) {
    await page.setViewport({ width, height });
    await settle(page);
    const measured = await page.evaluate(() => {
      const shell = document.querySelector('.inknote-shell');
      const editor = document
        .querySelector('.editor-layout')
        .getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth - innerWidth,
        layout: shell.dataset.layout,
        editorRight: editor.right,
        editorBottom: editor.bottom,
      };
    });
    assert.ok(
      measured.overflow <= 1 &&
        measured.editorRight <= width + 1 &&
        measured.editorBottom <= height + 1,
      `Panels must fit the viewport: ${JSON.stringify(measured)}`,
    );
    layouts.push(measured);
    await verifySidebarShortcuts(page);
    await page.screenshot({
      path: path.join(profile, `audit-${width}x${height}.png`),
    });
    await page.keyboard.down(modifier);
    await page.keyboard.press(',');
    await page.keyboard.up(modifier);
    await page.waitForSelector('.preferences-dialog');
    for (const tab of [
      'general',
      'editing',
      'preview',
      'themes',
      'keybindings',
      'backup',
    ]) {
      await page.click(`#settings-tab-${tab}`);
      await settle(page);
      const bounds = await page.$eval('.app-dialog', (element) => {
        const box = element.getBoundingClientRect();
        return {
          top: box.top,
          left: box.left,
          right: box.right,
          bottom: box.bottom,
        };
      });
      assert.ok(
        bounds.top >= 0 &&
          bounds.left >= 0 &&
          bounds.right <= width + 1 &&
          bounds.bottom <= height + 1,
        `Preferences ${tab} must fit ${width}x${height}: ${JSON.stringify(bounds)}`,
      );
    }
    await page.click('button[aria-label="Cerrar diálogo"]');
  }
  await page.setViewport(null);
  await writeFile(
    path.join(profile, 'layout-audit.json'),
    JSON.stringify({ delay, layouts, startupFrames }, null, 2),
  );
  console.log(
    'Native Cmd+R, last note, pending save, theme, typing and responsive Preferences passed.',
  );
  console.log(`Theme audit evidence: ${profile}`);
  assert.ok(fixture.id);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNativeCheck(
    process.argv.includes('--sidebar-only')
      ? async ({ page }) => {
          await page.setViewport({ width: 640, height: 480 });
          await settle(page);
          await verifySidebarShortcuts(page);
        }
      : verifySystemAudit,
  );
