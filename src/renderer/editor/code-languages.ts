import type { Completion } from '@codemirror/autocomplete';
import { LanguageDescription, LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdownLanguage } from '@codemirror/lang-markdown';

// Keep the grammars already bundled by the editor synchronous. The upstream
// catalog loads every other grammar with dynamic imports on first use.
const bundledSupport = new Map<string, LanguageSupport>([
  ['JavaScript', javascript()],
  ['JSX', javascript({ jsx: true })],
  ['TypeScript', javascript({ typescript: true })],
  ['TSX', javascript({ jsx: true, typescript: true })],
  ['JSON', json()],
  ['Markdown', new LanguageSupport(markdownLanguage)],
]);
const plainFences = new Set(['text', 'plaintext', 'mermaid']);

export const codeLanguages: readonly LanguageDescription[] = languages.map(
  (language) => {
    const support = bundledSupport.get(language.name);
    return LanguageDescription.of({
      name: language.name,
      alias: [
        ...language.alias,
        ...language.extensions,
        language.name.toLowerCase().replaceAll(' ', '-'),
        ...(language.name === 'YAML' ? ['github-actions'] : []),
      ].filter((alias) => !plainFences.has(alias.toLowerCase())),
      extensions: language.extensions,
      filename: language.filename,
      ...(support ? { support } : { load: () => language.load() }),
    });
  },
);

export function resolveCodeLanguage(info: string) {
  const identifier = info.trim().split(/\s+/, 1)[0];
  if (plainFences.has(identifier.toLowerCase())) return undefined;
  return (
    LanguageDescription.matchLanguageName(codeLanguages, identifier, false) ??
    undefined
  );
}

export function loadCodeLanguage(
  info: string,
): Promise<LanguageSupport | null> {
  // LanguageDescription.load caches both pending and successful loads and
  // clears a rejected load so a later render can retry it.
  return resolveCodeLanguage(info)?.load() ?? Promise.resolve(null);
}

const completions = new Map<string, Completion>();
for (const language of codeLanguages) {
  for (const label of language.alias) {
    if (!/^[\w+#.-]+$/.test(label) || completions.has(label)) continue;
    completions.set(label, { label, detail: language.name, type: 'type' });
  }
}
// These fences have dedicated rendering instead of a CodeMirror grammar.
completions.set('text', { label: 'text', detail: 'Plain text', type: 'type' });
completions.set('mermaid', {
  label: 'mermaid',
  detail: 'Mermaid',
  type: 'type',
});
export const codeLanguageCompletions: Completion[] = [...completions.values()];
