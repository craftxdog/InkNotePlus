import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';
import { inspectText } from './smoke-system-audit.mjs';

const builtins = [
  'inknote-light',
  'inknote-dark',
  'solarized-light',
  'solarized-dark',
  'kanagawa-wave',
  'kanagawa-dragon',
  'kanagawa-lotus',
];
const fixture =
  '# Registro de futuras mejoras\n\nTexto normal y `tools/azure_devops.py`, **negrita**, *cursiva* y [enlace](https://example.com).\n\n| ID | Mejora | Rama |\n| --- | --- | --- |\n| MEJ-001 | Texto de la tabla | `codex/feature-long-name` |\n\n> [!CAUTION]\n> Texto de advertencia\n\n> [!TIP]\n> Texto de consejo\n\n> [!NOTE]\n> Texto informativo\n\n> [!IMPORTANT]\n> Texto importante\n\n> [!WARNING]\n> Texto de precaución\n\n```js\n// Comentario\nconst total = 42;\nconsole.log("Mensaje", total);\n```\n\n- [ ] Tarea pendiente\n- [x] Tarea completada';
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
const settle = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });

// Optional copies contain theme CSS only, never the user's database or settings.
async function copyInstalledThemes(source, profile) {
  if (!source) return [];
  const names = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z][a-z0-9-]*$/.test(entry.name)) continue;
    const manifest = await readFile(
      path.join(source, entry.name, 'installed.json'),
      'utf8',
    );
    const theme = JSON.parse(manifest);
    assert.equal(theme.manifest.name, entry.name);
    for (const style of theme.styles) {
      const match =
        /^inknote-asset:\/\/themes\/([a-z][a-z0-9-]*)\/([\w.-]+)\/styles\/([\w-]+\.css)$/.exec(
          style,
        );
      assert(
        match && match[1] === entry.name,
        'Only revisioned theme CSS is copied.',
      );
      const relative = path.join(...match.slice(1, 3), 'styles', match[3]);
      const destination = path.join(profile, 'themes', relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(source, relative), destination);
    }
    await writeFile(
      path.join(profile, 'themes', entry.name, 'installed.json'),
      manifest,
    );
    names.push(entry.name);
  }
  return names;
}

async function modernFixture(profile) {
  const name = 'qa-modern-selection';
  const directory = path.join(profile, 'themes', name, '1.0.0-test', 'styles');
  await mkdir(directory, { recursive: true });
  // Original regression palette exercises color-mix(), unlike the built-ins.
  await writeFile(
    path.join(directory, 'ui.css'),
    `@layer theme.ui { :root {
    --page-background: #272528; --text-color: #eeeeee;
    --sidebar-background: #1e1c1f; --note-list-bar-background: #272528;
    --editor-background: #272528; --editor-background-color: #272528;
    --sidebar-menu-item-active-background: color-mix(in srgb, #f0c060 85%, transparent);
    --note-list-view-item-active-background: color-mix(in srgb, #f0c060 85%, transparent);
    --note-list-view-item-selected-background: rgb(255 255 255 / 7%);
    --preferences-sidebar-background: #272528;
    --preferences-sidebar-item-active-background: rgb(255 255 255 / 7%);
    --editor-focused-selection-background: color-mix(in oklab, oklch(70% .1 280) 30%, transparent);
    --editor-selection-background: color(display-p3 .3 .4 .6 / .25);
  } }`,
  );
  await writeFile(
    path.join(profile, 'themes', name, 'installed.json'),
    JSON.stringify({
      manifest: {
        name,
        version: '1.0.0',
        theme: true,
        themeAppearance: 'dark',
        styleSheets: ['ui.css'],
      },
      label: name,
      source: 'installed',
      styles: [`inknote-asset://themes/${name}/1.0.0-test/styles/ui.css`],
    }),
  );
  return name;
}

export async function verifyThemeSelection({ page, profile }) {
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  assert(original.ok);
  const viewport = page.viewport();
  const extra = process.argv
    .find((arg) => arg.startsWith('--theme-directory='))
    ?.slice('--theme-directory='.length);
  const installed = await copyInstalledThemes(extra, profile);
  const themes = [...builtins, ...installed, await modernFixture(profile)];
  await page.setViewport({ width: 1600, height: 1200 });
  const notes = await page.evaluate(
    async ({ fixture, colors }) => {
      const note = await window.inkNote.notes.create({
        title: 'Selección y contraste',
        body: fixture,
        metadata: {
          notebookId: null,
          status: 'active',
          isTemplate: false,
          tags: colors.map((c) => `${c} tag`),
        },
      });
      assertResult(note);
      for (const color of colors)
        assertResult(
          await window.inkNote.library.updateTag({
            name: `${color} tag`,
            nextName: `${color} tag`,
            color,
          }),
        );
      const other = await window.inkNote.notes.create({
        title: 'Otra nota de contraste',
        body: 'Texto sin seleccionar.',
      });
      assertResult(other);
      return [note.data.id, other.data.id];
      function assertResult(result) {
        if (!result.ok) throw new Error('Cannot prepare selection QA data.');
      }
    },
    { fixture, colors },
  );
  const report = [];
  try {
    for (const theme of themes) {
      const settings = await page.evaluate(
        (theme) =>
          window.inkNote.preferences.update({
            theme,
            editorMode: 'split',
            keyboardMode: 'standard',
            editorFontSize: 14,
            editorLineHeight: 1.6,
            activeLine: true,
            lineWrapping: 'all',
            syncScroll: true,
          }),
        theme,
      );
      assert(settings.ok);
      await page.reload({ waitUntil: 'networkidle0' });
      await page.$$eval('.note-list-item', (rows) =>
        rows
          .find((row) => row.textContent.includes('Selección y contraste'))
          .click(),
      );
      await page.waitForSelector('.mde-preview table');
      await page.focus('.cm-content');
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.down(modifier);
      await page.keyboard.press('a');
      await page.keyboard.up(modifier);
      await page.waitForSelector('.cm-selectionBackground');
      await settle(page);
      const focused = await page.evaluate(inspectText, { selection: true });
      const selection = await page.evaluate(() => {
        const marker = document.querySelector('.cm-selectionBackground');
        const probe = document.createElement('span');
        document.documentElement.append(probe);
        try {
          probe.style.backgroundColor =
            'var(--editor-focused-selection-background)';
          return {
            actual: getComputedStyle(marker).backgroundColor,
            expected: getComputedStyle(probe).backgroundColor,
            contrastRules:
              document.querySelector('style[data-theme-contrast]')
                ?.textContent ?? '',
          };
        } finally {
          probe.remove();
        }
      });
      await page.screenshot({
        path: path.join(profile, `selection-focused-${theme}.png`),
      });
      await page.focus('.document-title-input');
      await settle(page);
      const blurred = await page.evaluate(inspectText, { selection: true });
      await page.screenshot({
        path: path.join(profile, `selection-blurred-${theme}.png`),
      });
      await page.focus('.cm-content');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.down('Shift');
      for (let index = 0; index < 5; index++)
        await page.keyboard.press('ArrowRight');
      await page.keyboard.up('Shift');
      await page.waitForFunction(
        () => document.getSelection()?.toString() === 'Texto',
      );
      await settle(page);
      const partial = (
        await page.evaluate(inspectText, { selection: true })
      ).filter((sample) => sample.selected);
      assert(partial.length > 0, 'Measure an actual word selection.');
      await page.keyboard.press('ArrowLeft');
      const code = 'tools/azure_devops.py';
      const column = fixture.split('\n')[2].indexOf(code);
      for (let index = 0; index < column; index++)
        await page.keyboard.press('ArrowRight');
      await page.keyboard.down('Shift');
      for (let index = 0; index < code.length; index++)
        await page.keyboard.press('ArrowRight');
      await page.keyboard.up('Shift');
      await page.waitForFunction(
        (code) => document.getSelection()?.toString() === code,
        {},
        code,
      );
      await settle(page);
      const inline = (
        await page.evaluate(inspectText, { selection: true })
      ).filter((sample) => sample.selected);
      assert(
        inline.some((sample) => sample.selector.includes('md-inline-code')),
        'Measure selected inline code on the active line.',
      );
      const markers = await page.$$('.cm-selectionBackground');
      assert.equal(markers.length, 1, 'Start with a single word selection.');
      await page.keyboard.down(modifier);
      await page.keyboard.down('Alt');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.up('Alt');
      await page.keyboard.up(modifier);
      // addCursorBelow adds an empty secondary cursor. Extend both ranges so
      // the secondary selection is painted and its contrast is actually tested.
      await page.keyboard.down('Shift');
      for (let index = 0; index < 5; index++)
        await page.keyboard.press('ArrowRight');
      await page.keyboard.up('Shift');
      await page.waitForFunction(
        () => document.querySelectorAll('.cm-selectionBackground').length >= 2,
      );
      await settle(page);
      const multiple = (
        await page.evaluate(inspectText, { selection: true })
      ).filter((sample) => sample.selected);
      assert(
        multiple.length >= 2,
        'Measure primary and secondary selected text.',
      );
      await page.screenshot({
        path: path.join(profile, `selection-multiple-${theme}.png`),
      });
      const stored = await page.evaluate(
        (id) => window.inkNote.notes.list({ id }),
        notes[0],
      );
      assert(
        stored.ok && stored.data[0].body === fixture,
        'Selection must not change stored Markdown.',
      );
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(
        () => !document.querySelector('.cm-selectionBackground'),
      );
      await settle(page);
      const normal = await page.evaluate(inspectText);
      await page.keyboard.down(modifier);
      await page.keyboard.press('a');
      await page.keyboard.up(modifier);
      // Native select-all updates the DOM selection before CodeMirror has
      // reconciled it. Opening a dialog in that gap tests an uncommitted range.
      await page.waitForSelector('.cm-selectionBackground');
      await settle(page);
      const relevant = (samples) =>
        samples.filter(
          (sample) =>
            sample.selected ||
            ['active-note', 'active-sidebar'].includes(sample.context),
        );
      report.push({
        theme,
        selection,
        focused: relevant(focused),
        blurred: relevant(blurred),
        partial,
        inline,
        multiple,
        normal,
      });
    }
    // Theme changes should recolor an existing selection without remounting
    // the editor or requiring a page reload.
    const editor = await page.$('.cm-editor');
    for (const theme of [installed.at(-1) ?? 'inknote-dark', 'inknote-light']) {
      await page.click('button[aria-label="Preferencias"]');
      await page.click('#settings-tab-themes');
      await page.select('select[aria-label="Tema"]', theme);
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        {},
        theme,
      );
      const preferences = await page.evaluate(inspectText);
      assert.deepEqual(
        preferences.filter((item) => item.ratio < item.required),
        [],
        'Selected preferences tabs must stay readable.',
      );
      await page.click('button[aria-label="Cerrar diálogo"]');
      await page.waitForSelector('dialog', { hidden: true });
      // Inspect the range retained by the dialog flow. Forcing DOM focus here
      // can replace Chromium's native range with a caret; focused and blurred
      // selection contrast are both exercised explicitly in the loop above.
      await settle(page);
      assert(
        await page.evaluate(
          (editor) => editor === document.querySelector('.cm-editor'),
          editor,
        ),
        'Live theme activation preserves the editor instance.',
      );
      const samples = (
        await page.evaluate(inspectText, { selection: true })
      ).filter((sample) => sample.selected);
      assert(samples.length > 0, 'Live theme activation preserves selections.');
      assert.deepEqual(
        samples.filter((item) => item.ratio < item.required),
        [],
        'Live theme activation preserves selection contrast.',
      );
    }
    await writeFile(
      path.join(profile, 'selection-contrast.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(`Selection QA evidence: ${profile}`);
    const failures = report.flatMap(
      ({
        theme,
        focused,
        blurred,
        partial,
        inline,
        multiple,
        normal,
        selection,
      }) => [
        ...(selection.actual !== selection.expected
          ? [
              {
                theme,
                error: 'The focused selection ignores its theme token.',
                actual: selection.actual,
                expected: selection.expected,
              },
            ]
          : []),
        ...[
          ...focused,
          ...blurred,
          ...partial,
          ...inline,
          ...multiple,
          ...normal,
        ]
          .filter((item) => item.ratio < item.required)
          .map((item) => ({ theme, ...item })),
      ],
    );
    console.log(JSON.stringify(failures.slice(0, 12), null, 2));
    assert.equal(
      failures.length,
      0,
      'Selected text, active rows and tags must remain readable in every theme.',
    );
    assert(
      report.every((item) => item.focused.some((sample) => sample.selected)),
      'Actually measure selected source text.',
    );
    console.log(`Native selection contrast passed in ${themes.length} themes.`);
  } catch (error) {
    await page.screenshot({
      path: path.join(profile, 'selection-failure.png'),
    });
    throw error;
  } finally {
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
  await runNativeCheck(verifyThemeSelection);
