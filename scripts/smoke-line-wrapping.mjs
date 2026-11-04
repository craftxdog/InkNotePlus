import assert from 'node:assert/strict';

export async function verifyLineWrapping(page) {
  const body = `# Wrap modes\n\nproseanchor ${'ordinary prose stays wrapped. '.repeat(30)}\n\n\`\`\`js\nconst extremelyLong = '${'x'.repeat(180)}';\n\`\`\`\n\n| Name | Description |\n| --- | --- |\n| example | ${'long table value '.repeat(25)} |\n\nEnd.`;
  const original = await page.evaluate(() => window.inkNote.preferences.get());
  assert.equal(original.ok, true);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  async function find(text) {
    await page.focus('.cm-content');
    await page.keyboard.down(modifier);
    await page.keyboard.press('f');
    await page.keyboard.up(modifier);
    const input = '.cm-search input[name="search"]';
    await page.waitForSelector(input);
    await page.$eval(input, (element) => element.select());
    await page.keyboard.sendCharacter(text);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.cm-search', { hidden: true });
    await page.keyboard.press('ArrowRight');
  }
  async function choose(mode) {
    await page.click('button[aria-label="Preferencias"]');
    await page.click('#settings-tab-editing');
    await page.select(
      'select[aria-label="Ajuste de líneas (word wrap)"]',
      mode,
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"][aria-label="Preferencias"]', {
      hidden: true,
    });
    await page.waitForFunction(
      (mode) =>
        document
          .querySelector('.cm-content')
          .classList.contains('cm-lineWrapping') ===
        (mode !== 'off'),
      {},
      mode,
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  async function codeLayout() {
    return page.evaluate(() => {
      const content = document.querySelector('.cm-content');
      const code = [...content.querySelectorAll('.cm-line')].find((element) =>
        element.textContent.includes('const extremelyLong'),
      );
      if (!code) return null;
      return {
        height: code.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(content).lineHeight),
        unwrapped: code.classList.contains('inknote-unwrapped'),
        whiteSpace: getComputedStyle(code).whiteSpace,
      };
    });
  }
  try {
    await page.click('button[aria-label="Nueva nota"]');
    await page.waitForSelector('.cm-content');
    await page.focus('.cm-content');
    await page.keyboard.sendCharacter(body);
    await page.waitForFunction(() =>
      document.querySelector('.mde-preview')?.textContent.includes('End.'),
    );
    await choose('all');
    await find('extremelyLong');
    let code = await codeLayout();
    assert.ok(
      code.height > code.lineHeight * 1.5 && !code.unwrapped,
      JSON.stringify(code),
    );
    await choose('off');
    code = await codeLayout();
    assert.ok(code.height <= code.lineHeight * 1.5, JSON.stringify(code));
    await choose('prose');
    code = await codeLayout();
    assert.ok(
      code.unwrapped && code.height <= code.lineHeight * 1.5,
      JSON.stringify(code),
    );
    await choose('cursor');
    await find('extremelyLong');
    code = await codeLayout();
    assert.ok(
      code.unwrapped && code.height <= code.lineHeight * 1.5,
      JSON.stringify(code),
    );
    await find('proseanchor');
    await find('extremelyLong');
    await page.keyboard.down(modifier);
    await page.keyboard.press(
      process.platform === 'darwin' ? 'ArrowUp' : 'Home',
    );
    await page.keyboard.up(modifier);
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('.cm-line')].some((element) =>
          element.classList.contains('inknote-unwrapped'),
        ),
    );
    await page.waitForFunction(async () =>
      (await window.inkNote.notes.list()).data.some((note) =>
        note.body.includes('const extremelyLong'),
      ),
    );
    const note = await page.evaluate(async () =>
      (await window.inkNote.notes.list()).data.find((note) =>
        note.body.includes('const extremelyLong'),
      ),
    );
    assert.equal(
      note.body,
      body,
      'Changing wrapping must never modify Markdown.',
    );
    await page.reload({ waitUntil: 'networkidle0' });
    const persisted = await page.evaluate(() =>
      window.inkNote.preferences.get(),
    );
    assert.equal(persisted.data.preferences.lineWrapping, 'cursor');
    console.log(
      'Native four wrapping modes, live reconfiguration and preference persistence passed.',
    );
  } finally {
    await page.evaluate(
      (preferences) => window.inkNote.preferences.update(preferences),
      original.data.preferences,
    );
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.inknote-shell');
  }
}
