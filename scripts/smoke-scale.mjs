import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';

export async function verifyScale({ page, profile }) {
  const started = performance.now();
  let lastId;
  for (let offset = 0; offset < 3000; offset += 100) {
    lastId = await page.evaluate(async (offset) => {
      let id;
      for (let index = offset; index < offset + 100; index++) {
        const result = await window.inkNote.notes.create({
          title: `QA_SCALE_${String(index).padStart(4, '0')}`,
          body: `Indexed body ${index} español 日本語`,
        });
        if (!result.ok) throw new Error(`Cannot create scale note ${index}`);
        id = result.data.id;
      }
      return id;
    }, offset);
    if ((offset + 100) % 1000 === 0)
      console.log(`Scale fixture: ${offset + 100}/3000 notes`);
  }
  await page.waitForFunction(() =>
    document
      .querySelector('.note-list-footer')
      ?.textContent.trim()
      .startsWith('3000 notas'),
  );
  const rows = await page.$$eval(
    '.note-list-item',
    (elements) => elements.length,
  );
  assert(
    rows > 0 && rows <= 100,
    'The list must paginate instead of mounting all 3000 notes.',
  );
  const searchStarted = performance.now();
  await page.type('#note-search', 'QA_SCALE_2999');
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.note-list-item').length === 1 &&
      document
        .querySelector('.note-list-item')
        .textContent.includes('QA_SCALE_2999'),
  );
  const searchMs = Math.round(performance.now() - searchStarted);
  await page.click('.note-list-item');
  await page.waitForFunction(
    () =>
      document.querySelector('.document-title-input')?.value ===
      'QA_SCALE_2999',
  );
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(
    () =>
      document.querySelector('.document-title-input')?.value ===
      'QA_SCALE_2999',
  );
  const stored = await page.evaluate(
    async (id) => window.inkNote.notes.list({ id }),
    lastId,
  );
  assert.equal(stored.data[0].id, lastId);
  const metrics = await page.metrics();
  const report = {
    notes: 3000,
    mountedRows: rows,
    totalMs: Math.round(performance.now() - started),
    searchMs,
    jsHeapMiB: Math.round(metrics.JSHeapUsedSize / 1024 / 1024),
    restoredNoteId: lastId,
  };
  await writeFile(
    path.join(profile, 'scale-qa.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    'Native 3000-note pagination, search and reload passed:',
    JSON.stringify(report),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNativeCheck(verifyScale);
