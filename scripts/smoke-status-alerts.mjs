import assert from 'node:assert/strict';
import path from 'node:path';

const trigger = 'button[aria-label^="Estado de la nota:"]';
const menu = '.status-picker-menu';

export async function chooseNoteStatus(page, status) {
  await page.click(trigger);
  await page.click(`.status-picker-option[value="${status}"]`);
  await page.waitForSelector(menu, { hidden: true });
}

export async function verifyStatusAndAlerts({ page, profile }) {
  const original = await page.evaluate(async () => ({
    note: (await window.inkNote.notes.list()).data[0],
    preferences: (await window.inkNote.preferences.get()).data.preferences,
  }));
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const types = ['note', 'tip', 'important', 'warning', 'caution'];
  const fixture = types
    .map(
      (type) =>
        `> [!${type.toUpperCase()}]\n> ${type === 'tip' ? '- [ ] Interactive task' : `Body **${type}**`}`,
    )
    .join('\n\n');
  const waitForStatus = (status) =>
    page.waitForFunction(
      async ({ id, status }) =>
        (await window.inkNote.notes.list()).data.find((note) => note.id === id)
          ?.metadata.status === status,
      {},
      { id: original.note.id, status },
    );
  const setBody = async (body) => {
    await page.focus('.cm-content');
    await page.keyboard.down(modifier);
    await page.keyboard.press('a');
    await page.keyboard.up(modifier);
    await page.keyboard.sendCharacter(body);
    await page.waitForFunction(
      async ({ id, body }) =>
        (await window.inkNote.notes.list()).data.find((note) => note.id === id)
          ?.body === body,
      {},
      { id: original.note.id, body },
    );
  };
  try {
    for (const status of ['none', 'active', 'onhold', 'completed', 'dropped']) {
      await chooseNoteStatus(page, status);
      await waitForStatus(status);
      const saved = await page.evaluate(
        async (id) =>
          (await window.inkNote.notes.list()).data.find(
            (note) => note.id === id,
          ),
        original.note.id,
      );
      assert.deepEqual(saved.metadata, { ...original.note.metadata, status });
      assert.equal(saved.body, original.note.body);
    }
    await chooseNoteStatus(page, 'active');
    await waitForStatus('active');
    await page.click(trigger);
    assert.equal(
      await page.$eval(
        '.status-picker-option[aria-checked="true"]',
        (button) =>
          button === document.activeElement && button.value === 'active',
      ),
      true,
    );
    await page.keyboard.press('End');
    assert.equal(
      await page.evaluate(() => document.activeElement.value),
      'dropped',
    );
    await page.keyboard.press('Escape');
    assert.equal(
      await page.$eval(trigger, (button) => button === document.activeElement),
      true,
    );
    await page.click(trigger);
    await page.click(trigger);
    await page.waitForSelector(menu, { hidden: true });
    await page.click(trigger);
    await page.click('.document-title-input');
    await page.waitForSelector(menu, { hidden: true });
    await setBody(fixture);
    await page.waitForFunction(
      () => document.querySelectorAll('.mde-preview .gfm-alert').length === 5,
    );
    await page.click('.gfm-alert-type-tip input[type="checkbox"]');
    await page.waitForFunction(
      async ({ id, body }) =>
        (await window.inkNote.notes.list()).data.find((note) => note.id === id)
          ?.body === body,
      {},
      { id: original.note.id, body: fixture.replace('[ ]', '[x]') },
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.cm-line')].some((line) =>
        line.textContent.includes('[x]'),
      ),
    );
    await page.click('.gfm-alert-type-tip input[type="checkbox"]');
    await page.waitForFunction(
      async ({ id, body }) =>
        (await window.inkNote.notes.list()).data.find((note) => note.id === id)
          ?.body === body,
      {},
      { id: original.note.id, body: fixture },
    );

    const backgrounds = new Set();
    for (const theme of ['inknote-light', 'solarized-light', 'inknote-dark']) {
      await page.evaluate(
        (theme) => window.inkNote.preferences.update({ theme }),
        theme,
      );
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('.gfm-alert-type-caution');
      await page.waitForFunction(
        () => document.querySelectorAll('.cm-line.md-alert-line').length >= 10,
      );
      const alerts = await page.evaluate(
        (types) =>
          types.map((type) => {
            const title = document.querySelector(
              `.gfm-alert-type-${type} .gfm-alert-title`,
            );
            const line = document.querySelector(`.cm-line.md-alert-${type}`);
            const marker = line?.querySelector('.md-alert-marker');
            return {
              type,
              titleColor: title && getComputedStyle(title).color,
              markerColor: marker && getComputedStyle(marker).color,
              markerStyle: marker && getComputedStyle(marker).fontStyle,
              shadow: line && getComputedStyle(line).boxShadow,
              border:
                title && getComputedStyle(title.parentElement).borderLeftWidth,
              icon: !!title?.querySelector('svg'),
            };
          }),
        types,
      );
      for (const alert of alerts) {
        assert.equal(
          alert.markerColor,
          alert.titleColor,
          JSON.stringify(alert),
        );
        assert.equal(alert.markerStyle, 'normal', JSON.stringify(alert));
        assert.notEqual(alert.shadow, 'none', JSON.stringify(alert));
        assert.ok(
          parseFloat(alert.border) > 0 && alert.icon,
          JSON.stringify(alert),
        );
      }
      const alignment = await page.evaluate(() => {
        const notebook = document
          .querySelector('.navigation-item--notebook > svg')
          .getBoundingClientRect();
        return [
          ...document.querySelectorAll(
            '.navigation-item[class*="status-"] > svg',
          ),
        ].map((icon) =>
          Math.abs(icon.getBoundingClientRect().left - notebook.left),
        );
      });
      assert.equal(alignment.length, 4);
      assert.ok(
        alignment.every((difference) => difference < 2),
        JSON.stringify(alignment),
      );
      await page.click(trigger);
      const status = await page.$eval(menu, (popup) => {
        const active = popup.querySelector('[value="active"]');
        const circle = active.querySelector('circle');
        const play = active.querySelector('polygon, path');
        const box = popup.getBoundingClientRect();
        return {
          background: getComputedStyle(popup).backgroundColor,
          circle: getComputedStyle(circle).fill,
          play: getComputedStyle(play).fill,
          playAboveCircle: !!(
            circle.compareDocumentPosition(play) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
          weight: getComputedStyle(active).fontWeight,
          bounds:
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.bottom <= innerHeight,
        };
      });
      assert.notEqual(
        status.circle,
        status.play,
        'The active play glyph must remain visible.',
      );
      assert.equal(
        status.playAboveCircle,
        true,
        'The filled circle must not cover the play glyph.',
      );
      assert.ok(
        Number(status.weight) >= 600 && status.bounds,
        JSON.stringify(status),
      );
      backgrounds.add(status.background);
      await page.screenshot({
        path: path.join(profile, `status-alerts-${theme}.png`),
      });
      await page.keyboard.press('Escape');
    }
    assert.equal(backgrounds.size, 3);
  } finally {
    await page.keyboard.press('Escape');
    await setBody(original.note.body);
    await chooseNoteStatus(page, original.note.metadata.status);
    await waitForStatus(original.note.metadata.status);
    await page.evaluate(
      (preferences) => window.inkNote.preferences.update(preferences),
      original.preferences,
    );
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.cm-content');
  }
  console.log(
    `Status menu, icons, alignment, autosave, alert tasks and five alert colors in three themes passed.\nScreenshots: ${profile}`,
  );
}
