import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNativeCheck } from './smoke-editor-layout.mjs';
import { inspectText } from './smoke-system-audit.mjs';

const fixtures = [
  ['tsx', 'export const Item = () => <div>Hello</div>;\n// second line'],
  ['json', '{\n  "enabled": true, "count": 18\n}'],
  ['bash', '# shell\nif [ -f "$HOME/test" ]; then echo "ready"; fi'],
  ['python', '# python\ndef greet(name):\n    return "Hello " + name'],
  ['lisp', '(defun greet (name) (print name))'],
  ['c', '#include <stdio.h>\nint main(void) { return 0; }'],
  [
    'c++',
    '#include <string>\nint main() { std::string name = "Hello"; return 0; }',
  ],
  ['go', 'package main\nfunc main() { println("Hello") }'],
  ['rust', 'fn main() { let name = "Hello"; println!("{}", name); }'],
  [
    'java',
    'public class Main { public static void main(String[] args) { System.out.println("Hello"); } }',
  ],
  [
    'diff',
    '--- a/test.txt\n+++ b/test.txt\n@@ -1 +1 @@\n-old value\n+new value',
  ],
  [
    'github-actions',
    'name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "Hello"',
  ],
];
const themes = [
  'inknote-light',
  'inknote-dark',
  'solarized-light',
  'solarized-dark',
  'kanagawa-wave',
  'kanagawa-dragon',
  'kanagawa-lotus',
];

export async function verifyCodeBlocks({ page, profile }) {
  const body =
    fixtures
      .map(
        ([language, code]) =>
          `## ${language}\n\n\`\`\`${language} filename="src/example.${language}" line=18 title="Example ${language}"\n${code}\n\`\`\``,
      )
      .join('\n\n') +
    '\n\n```unknownlang\n<script>literal & safe</script>\n```\n\nFinalAnchor';
  const created = await page.evaluate(
    (body) =>
      window.inkNote.notes.create({ title: 'QA rich code blocks', body }),
    body,
  );
  assert.equal(created.ok, true);
  const report = [];
  for (const theme of themes) {
    const preferences = await page.evaluate(
      (theme) =>
        window.inkNote.preferences.update({
          theme,
          editorMode: 'split',
          syncScroll: true,
        }),
      theme,
    );
    assert.equal(preferences.ok, true);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll('.mde-preview .codeblock').length === count,
      {},
      fixtures.length + 1,
    );
    await page.waitForFunction(
      (languages) =>
        languages.every((language) =>
          [...document.querySelectorAll('.codeblock code')].some(
            (code) =>
              code.classList.contains(`language-${language}`) &&
              code.querySelector('span[class*="tok-"]'),
          ),
        ),
      {},
      fixtures.map(([language]) => language),
    );
    await page.evaluate(() => document.fonts.ready);
    const blocks = await page.$$eval('.mde-preview .codeblock', (blocks) =>
      blocks.map((block) => ({
        text: block.querySelector('code').textContent,
        title: block.querySelector('.codeblock-title')?.textContent,
        filename: block.querySelector('.codeblock-filename')?.textContent,
        numbers: block.querySelector('.mde-preview-code-line-number')
          ?.textContent,
        source: block.hasAttribute('data-source-start'),
        tokens: block.querySelectorAll('code span[class*="tok-"]').length,
      })),
    );
    const contrast = [];
    for (let i = 0; i < fixtures.length; i++) {
      const [language, code] = fixtures[i];
      assert.equal(blocks[i].text, `${code}\n`);
      assert.equal(blocks[i].title, `Example ${language}`);
      assert.equal(blocks[i].filename, `src/example.${language}`);
      assert.equal(
        blocks[i].numbers,
        code
          .split('\n')
          .map((_, index) => 18 + index)
          .join('\n'),
      );
      assert.equal(blocks[i].source, true);
      assert.ok(blocks[i].tokens > 0, `${language} must use a real grammar.`);
      await page.$$eval(
        '.mde-preview .codeblock',
        (blocks, index) => blocks[index].scrollIntoView({ block: 'center' }),
        i,
      );
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const text = await page.evaluate(inspectText);
      contrast.push(
        ...text.filter((item) =>
          /tok-|codeblock-title|codeblock-filename|codeblock-info/.test(
            item.selector,
          ),
        ),
      );
    }
    assert.deepEqual(
      contrast.filter((item) => item.ratio < item.required - 0.05),
      [],
      `${theme}: code and metadata must stay readable.`,
    );
    assert.equal(blocks.at(-1).text, '<script>literal & safe</script>\n');
    assert.equal(blocks.at(-1).title, undefined);
    assert.equal(await page.$('.mde-preview script'), null);
    await page.$$eval('.mde-preview .codeblock', (blocks) =>
      blocks[0].scrollIntoView({ block: 'start' }),
    );
    await page.screenshot({
      path: path.join(profile, `codeblocks-${theme}.png`),
    });
    report.push({
      theme,
      languages: fixtures.length,
      contrastChecks: contrast.length,
      minimumContrast: Math.min(...contrast.map((item) => item.ratio)),
    });
  }
  const stored = await page.evaluate(
    (id) => window.inkNote.notes.list({ id }),
    created.data.id,
  );
  assert.equal(
    stored.data[0].body,
    body,
    'Rendering must preserve the saved source.',
  );
  await page.click('button[aria-label="Nueva nota"]');
  await page.waitForSelector('.cm-content');
  await page.focus('.cm-content');
  await page.keyboard.sendCharacter('```');
  await page.waitForSelector('.cm-tooltip-autocomplete');
  await page.keyboard.sendCharacter('bash');
  await page.waitForFunction(() =>
    document
      .querySelector('.cm-tooltip-autocomplete')
      ?.textContent.includes('Shell'),
  );
  await page.keyboard.press('Enter');
  await page.keyboard.sendCharacter('\necho "Native completion"\n```');
  await page.waitForFunction(
    () =>
      document.querySelector('code.language-bash .tok-string')?.textContent ===
      '"Native completion"',
  );
  assert.ok(
    await page.$('.cm-content span[class*="tok-"]'),
    'The editor also highlights the selected grammar.',
  );
  await writeFile(
    path.join(profile, 'codeblocks.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Code blocks: ${fixtures.length} grammars, seven themes, metadata, safe fallback, completion and editor passed.`,
    JSON.stringify(report),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNativeCheck(verifyCodeBlocks);
