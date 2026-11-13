import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';
import { inspectText } from './smoke-system-audit.mjs';

const themes = [
  'inknote-light',
  'inknote-dark',
  'solarized-light',
  'solarized-dark',
  'kanagawa-wave',
  'kanagawa-dragon',
  'kanagawa-lotus',
];
const fixture =
  '# Editor decoration QA\n\n> Plain quote\n> Continued quote\n\n> [!CAUTION]\n> Parent body\n> > [!TIP]\n> > Child **body**\n\n';
const settle = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });

export async function verifyEditorDecorations({ page, profile }) {
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  assert.equal(original.ok, true);
  const viewport = page.viewport();
  const wasFocused = !!(await page.$(
    'button[aria-label="Salir de modo concentración"]',
  ));
  const results = [];
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    for (const theme of themes) {
      const configured = await page.evaluate(
        (theme) =>
          window.inkNote.preferences.update({
            theme,
            editorMode: 'split',
            splitRatio: 50,
            keyboardMode: 'standard',
            editorFontSize: 14,
            editorLineHeight: 1.6,
            activeLine: true,
            lineWrapping: 'all',
            syncScroll: true,
          }),
        theme,
      );
      assert.equal(configured.ok, true);
      await page.reload({ waitUntil: 'networkidle0' });
      await page.click('button[aria-label="Nueva nota"]');
      await page.waitForSelector('.cm-content');
      await page.focus('.cm-content');
      await page.keyboard.sendCharacter(fixture);
      await page.waitForSelector('.gfm-alert-type-caution .gfm-alert-type-tip');
      await page.keyboard.type('/');
      await page.waitForSelector('.inknote-completion-menu [role="option"]');
      await settle(page);
      const contrast = (await page.evaluate(inspectText)).filter((item) =>
        item.selector.includes('completion'),
      );
      const state = await page.evaluate(() => {
        const menu = document.querySelector('.inknote-completion-menu');
        const rows = [...menu.querySelectorAll('[role="option"]')];
        const groups = [
          ...menu.querySelectorAll('.inknote-completion-section'),
        ].map((node) => node.textContent);
        const rect = menu.getBoundingClientRect();
        const nested = [...document.querySelectorAll('.cm-line')].find(
          (line) => line.textContent === '> > [!TIP]',
        );
        const parent = nested.querySelector(
          '.md-alert-marker.md-alert-caution',
        );
        const child = nested.querySelector('.md-alert-marker.md-alert-tip');
        const normal = document.querySelector(
          '.cm-line.md-blockquote-line:not(.md-alert-line)',
        );
        return {
          groups,
          labels: rows.map(
            (row) => row.querySelector('.cm-completionLabel').textContent,
          ),
          icons: rows.filter((row) =>
            row.querySelector('svg[aria-hidden="true"]'),
          ).length,
          options: rows.length,
          font: getComputedStyle(rows[0]).fontFamily,
          pageFont: getComputedStyle(document.documentElement).fontFamily,
          active: menu.querySelector(
            '[aria-selected="true"] .cm-completionLabel',
          ).textContent,
          nestedRail: getComputedStyle(nested).boxShadow,
          parentColor: getComputedStyle(parent).color,
          childColor: getComputedStyle(child).color,
          previewChildColor: getComputedStyle(
            document.querySelector('.gfm-alert-type-tip > .gfm-alert-title'),
          ).color,
          normalRail: getComputedStyle(normal).boxShadow,
          bounds: {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          },
          width: innerWidth,
          height: innerHeight,
        };
      });
      assert.deepEqual(state.groups, [
        'Formato básico',
        'Alertas de GitHub',
        'Insertar',
      ]);
      assert.equal(state.active, 'Bloque de código');
      assert.equal(state.icons, state.options);
      assert.equal(state.font, state.pageFont);
      assert(
        contrast.length > 0,
        'Measure visible completion labels and hints.',
      );
      assert.deepEqual(
        contrast.filter((item) => item.ratio < item.required),
        [],
        `${theme}: completion text must meet WCAG AA contrast.`,
      );
      assert(
        state.nestedRail.includes(state.parentColor),
        'The parent keeps its continuous rail.',
      );
      assert.notEqual(state.childColor, state.parentColor);
      assert.equal(state.childColor, state.previewChildColor);
      assert.notEqual(state.normalRail, 'none');
      assert(state.bounds.left >= 0 && state.bounds.right <= state.width + 1);
      assert(state.bounds.top >= 0 && state.bounds.bottom <= state.height + 1);
      await page.screenshot({
        path: path.join(profile, `editor-decorations-${theme}.png`),
      });
      await page.$eval('.inknote-completion-menu > ul', (list) => {
        list.scrollTop = list.scrollHeight;
      });
      await page.screenshot({
        path: path.join(profile, `editor-decorations-alerts-${theme}.png`),
      });
      await page.$eval('.inknote-completion-menu > ul', (list) => {
        list.scrollTop = 0;
      });
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() =>
        document.querySelector('.cm-content').textContent.endsWith('# texto'),
      );
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.down(modifier);
      await page.keyboard.press('z');
      await page.keyboard.up(modifier);
      await page.waitForFunction(() =>
        document.querySelector('.cm-content').textContent.endsWith('/'),
      );
      await page.keyboard.type('tip');
      await page.waitForFunction(
        () =>
          document.querySelector(
            '.inknote-completion-menu [aria-selected="true"] .cm-completionLabel',
          )?.textContent === 'Alerta · Tip',
      );
      const filteredContrast = (await page.evaluate(inspectText)).filter(
        (item) => item.selector.includes('completion'),
      );
      assert.deepEqual(
        filteredContrast.filter((item) => item.ratio < item.required),
        [],
        `${theme}: filtered completion text must meet WCAG AA contrast.`,
      );
      await page.click('.inknote-completion-menu .inknote-completion-tip');
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.mde-preview .gfm-alert-type-tip')
            .length === 2,
      );
      results.push({ theme, ...state, contrast, filteredContrast });
    }
    await page.click('button[aria-label="Sólo editor"]');
    if (await page.$('button[aria-label="Modo concentración"]'))
      await page.click('button[aria-label="Modo concentración"]');
    for (const viewport of [
      { width: 640, height: 480 },
      { width: 360, height: 540 },
    ]) {
      await page.setViewport(viewport);
      await page.focus('.cm-content');
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.down(modifier);
      await page.keyboard.press(
        process.platform === 'darwin' ? 'ArrowDown' : 'End',
      );
      await page.keyboard.up(modifier);
      await page.keyboard.sendCharacter('\n\n' + 'Content\n'.repeat(40));
      await page.keyboard.type('/');
      await page.waitForSelector('.inknote-completion-menu [role="option"]');
      await settle(page);
      const bounds = await page.$eval('.inknote-completion-menu', (menu) => {
        const rect = menu.getBoundingClientRect();
        const list = menu.querySelector('ul');
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          scrollable: list.scrollHeight > list.clientHeight,
        };
      });
      assert(
        bounds.left >= 0 && bounds.right <= viewport.width + 1,
        'Compact menu fits horizontally.',
      );
      assert(
        bounds.top >= 0 && bounds.bottom <= viewport.height + 1,
        'Compact menu fits vertically.',
      );
      assert(bounds.scrollable, 'All commands remain reachable by scrolling.');
      await page.screenshot({
        path: path.join(profile, `editor-decorations-${viewport.width}.png`),
      });
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.querySelector('.inknote-completion-menu'),
      );
      assert(
        await page.$eval('.cm-content', (content) =>
          content.textContent.endsWith('/'),
        ),
        'Escape leaves Markdown untouched.',
      );
      results.push({ viewport, bounds, escapePreservesSource: true });
    }
    await writeFile(
      path.join(profile, 'editor-decorations.json'),
      JSON.stringify(results, null, 2),
    );
    console.log(
      'Native grouped slash menu, SVG icons, keyboard/mouse, undo, nested alerts and contrast passed in seven themes; compact placement and Escape passed at two viewport sizes.',
    );
    console.log(`Editor decoration evidence: ${profile}`);
  } catch (error) {
    await page.screenshot({
      path: path.join(profile, 'editor-decorations-failure.png'),
    });
    throw error;
  } finally {
    if (
      !wasFocused &&
      (await page.$('button[aria-label="Salir de modo concentración"]'))
    )
      await page.click('button[aria-label="Salir de modo concentración"]');
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
  await runNativeCheck(verifyEditorDecorations);
