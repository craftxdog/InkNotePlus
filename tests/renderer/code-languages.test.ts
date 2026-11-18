import { expect, it } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { languages } from '@codemirror/language-data';
import {
  codeLanguages,
  codeLanguageCompletions,
  loadCodeLanguage,
  resolveCodeLanguage,
} from '../../src/renderer/editor/code-languages';

it.each([
  ['bash', 'Shell'],
  ['sh', 'Shell'],
  ['python', 'Python'],
  ['py', 'Python'],
  ['c', 'C'],
  ['c++', 'C++'],
  ['cpp', 'C++'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['rs', 'Rust'],
  ['java', 'Java'],
  ['json', 'JSON'],
  ['jsx', 'JSX'],
  ['tsx', 'TSX'],
  ['github-actions', 'YAML'],
  ['yaml', 'YAML'],
  ['diff', 'diff'],
  ['patch', 'diff'],
])('resolves %s through the shared catalog as %s', (alias, name) => {
  expect(resolveCodeLanguage(alias)?.name).toBe(name);
});

it('matches exact language identifiers case-insensitively while leaving metadata to its parser', () => {
  expect(
    resolveCodeLanguage('  Py filename="example.py" title="Script"')?.name,
  ).toBe('Python');
  expect(resolveCodeLanguage('not-python')).toBeUndefined();
  expect(resolveCodeLanguage('github')).toBeUndefined();
  expect(resolveCodeLanguage('git')).toBeUndefined();
});

it('builds unique fence choices from upstream language metadata', () => {
  expect(codeLanguages.map(({ name }) => name)).toEqual(
    languages.map(({ name }) => name),
  );
  const labels = codeLanguageCompletions.map(({ label }) => label);
  expect(new Set(labels.map((label) => label.toLowerCase())).size).toBe(
    labels.length,
  );
  for (const alias of [
    'bash',
    'sh',
    'py',
    'c++',
    'cpp',
    'go',
    'rs',
    'java',
    'json',
    'tsx',
    'github-actions',
    'diff',
    'patch',
  ]) {
    expect(
      codeLanguageCompletions.find(({ label }) => label === alias)?.detail,
    ).toBeTruthy();
  }
  expect(labels).toContain('text');
  expect(labels).toContain('mermaid');
});

it('deduplicates lazy language loads across aliases and exposes the loaded parser', async () => {
  const python = resolveCodeLanguage('python');
  const first = loadCodeLanguage('python');
  const alias = loadCodeLanguage('py');
  expect(first).toBe(alias);
  const support = await first;
  expect(support).toBeTruthy();
  expect(python?.support).toBe(support);
  expect(await loadCodeLanguage('PY filename="test.py"')).toBe(support);
});

it.each([
  ['bash', 'echo "hello"'],
  ['python', 'def hello():\n    return True'],
  ['c', 'int main() { return 0; }'],
  ['cpp', 'class Example { public: int value = 1; };'],
  ['go', 'package main\nfunc main() {}'],
  ['rust', 'fn main() { let value = true; }'],
  ['java', 'class Example { public static void main(String[] args) {} }'],
  [
    'github-actions',
    'name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest',
  ],
  ['diff', '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new'],
])(
  'uses the %s grammar inside the actual Markdown editor parser',
  async (alias, source) => {
    await loadCodeLanguage(alias);
    const state = EditorState.create({
      doc: `\`\`\`${alias}\n${source}\n\`\`\``,
      extensions: [markdown({ base: markdownLanguage, codeLanguages })],
    });
    const tree = ensureSyntaxTree(state, state.doc.length, 1000);
    expect(tree).toBeTruthy();
    const codeStart = state.doc.line(2).from;
    const codeEnd = state.doc.line(state.doc.lines).from;
    const spans: string[] = [];
    highlightTree(tree!, classHighlighter, (from, to, classes) => {
      if (from >= codeStart && to <= codeEnd) spans.push(classes);
    });
    expect(spans.length).toBeGreaterThan(0);
  },
);

it('keeps existing JavaScript family, JSON and Markdown parsers available synchronously', () => {
  for (const alias of ['js', 'ts', 'jsx', 'tsx', 'json', 'md']) {
    expect(resolveCodeLanguage(alias)?.support).toBeTruthy();
  }
});

it('loads every advertised parser from the upstream catalog', async () => {
  await Promise.all(
    codeLanguages.map(async (description) => {
      const support = await description.load();
      expect(support.language.parser.parse('').length).toBe(0);
    }),
  );
});

it.each(['', 'text', 'plaintext', 'mermaid', 'unknown-language'])(
  'uses plain rendering instead of loading a grammar for %s',
  async (info) => {
    expect(resolveCodeLanguage(info)).toBeUndefined();
    expect(await loadCodeLanguage(info)).toBeNull();
  },
);
