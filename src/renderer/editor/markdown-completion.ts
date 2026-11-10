import {
  autocompletion,
  pickedCompletion,
  snippet,
  snippetCompletion,
  type Completion,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { Facet } from '@codemirror/state';
import type { Command, EditorView } from '@codemirror/view';
import { alertLabels } from './github-alerts';

const imagePicker = Facet.define<() => (() => void) | undefined>();
export const insertEditorImage: Command = (view) => {
  if (view.state.readOnly) return false;
  const pick = view.state.facet(imagePicker)[0]?.();
  if (!pick) return false;
  pick();
  return true;
};

export const markdownSnippets = {
  'core:insert-alert-note': {
    label: 'Alerta · Note',
    template: '> [!NOTE]\n> ${texto}',
  },
  'core:insert-alert-tip': {
    label: 'Alerta · Tip',
    template: '> [!TIP]\n> ${texto}',
  },
  'core:insert-alert-important': {
    label: 'Alerta · Important',
    template: '> [!IMPORTANT]\n> ${texto}',
  },
  'core:insert-alert-warning': {
    label: 'Alerta · Warning',
    template: '> [!WARNING]\n> ${texto}',
  },
  'core:insert-alert-caution': {
    label: 'Alerta · Caution',
    template: '> [!CAUTION]\n> ${texto}',
  },
  'core:insert-code-block': {
    label: 'Bloque de código',
    template: '```${lenguaje}\n${código}\n```',
  },
  'core:insert-horizontal-rule': {
    label: 'Separador horizontal',
    template: '* * *\n\n${}',
  },
  'core:insert-table': {
    label: 'Tabla',
    template: '| ${Columna 1} | ${Columna 2} |\n| --- | --- |\n| ${} | |',
  },
} as const;

export function insertSnippet(
  view: EditorView,
  command: keyof typeof markdownSnippets,
) {
  if (view.state.readOnly) return false;
  const { from, to } = view.state.selection.main;
  snippet(markdownSnippets[command].template)(view, null, from, to);
  view.focus();
  return true;
}

const slashOptions: Completion[] = [
  ...[1, 2, 3, 4].map((level) =>
    snippetCompletion('#'.repeat(level) + ' ${texto}', {
      label: `Encabezado ${level}`,
    }),
  ),
  snippetCompletion('- ${texto}', { label: 'Lista con viñetas' }),
  snippetCompletion('1. ${texto}', { label: 'Lista numerada' }),
  snippetCompletion('- [ ] ${tarea}', { label: 'Lista de tareas' }),
  snippetCompletion('> ${texto}', { label: 'Cita' }),
  ...Object.values(markdownSnippets).map(({ label, template }) =>
    snippetCompletion(template, { label }),
  ),
];

const codeLanguages = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'json',
  'markdown',
  'mermaid',
  'text',
];

const completeEmoji: CompletionSource = async (context) => {
  const { state, pos } = context;
  const match = context.matchBefore(/(?:^|[^\p{L}\p{N}_/:]):[a-z0-9_+-]{2,}/iu);
  if (!match || state.readOnly || state.selection.ranges.length !== 1)
    return null;
  const tree = syntaxTree(state);
  for (
    let node: ReturnType<typeof tree.resolve> | null = tree.resolve(pos, -1);
    node;
    node = node.parent
  ) {
    if (
      [
        'InlineCode',
        'FencedCode',
        'CodeBlock',
        'Link',
        'URL',
        'Image',
      ].includes(node.name)
    )
      return null;
  }
  const name = match.text.slice(match.text.lastIndexOf(':') + 1).toLowerCase();
  const { nameToEmoji } = await import('gemoji');
  if (context.aborted) return null;
  const options = Object.entries(nameToEmoji)
    .filter(([key]) => key.startsWith(name))
    .slice(0, 30)
    .map(([key, emoji]) => ({
      label: `:${key}:`,
      detail: emoji,
      apply: emoji,
    }));
  return { from: pos - name.length - 1, options };
};

export function markdownCompletion(options: {
  insertImage: () => (() => void) | undefined;
  noteLinks?: CompletionSource;
}) {
  const source: CompletionSource = (context) => {
    const { state, pos } = context;
    if (state.selection.ranges.length !== 1 || state.readOnly) return null;
    const line = state.doc.lineAt(pos);
    const before = state.sliceDoc(line.from, pos);
    const fence = /^ {0,3}(?:`{3,}|~{3,})([a-z]*)$/i.exec(before);
    const tree = syntaxTree(state);
    for (
      let node: ReturnType<typeof tree.resolve> | null = tree.resolve(pos, -1);
      node;
      node = node.parent
    ) {
      if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') continue;
      if (
        node.name === 'FencedCode' &&
        state.doc.lineAt(node.from).from === line.from &&
        fence
      ) {
        return {
          from: pos - fence[1].length,
          options: codeLanguages.map((label) => ({ label, type: 'type' })),
          validFor: /^[a-z]*$/i,
        };
      }
      return null;
    }
    const alert = /^\s*>\s*\[!([a-z]*)$/i.exec(before);
    if (alert) {
      return {
        from: pos - alert[1].length,
        to: state.sliceDoc(pos, pos + 1) === ']' ? pos + 1 : pos,
        options: Object.values(alertLabels).map((label) => ({
          label: label.toUpperCase(),
          apply: `${label.toUpperCase()}]`,
        })),
      };
    }
    if (
      !/^ {0,3}\/[\p{L}\p{N} -]*$/u.test(before) ||
      state.sliceDoc(pos, line.to).trim()
    )
      return null;
    const slash = line.from + before.indexOf('/');
    const actions = [...slashOptions];
    if (options.insertImage())
      actions.push({
        label: 'Imagen',
        apply(view, completion, from, to) {
          view.dispatch({
            changes: { from, to, insert: '' },
            annotations: pickedCompletion.of(completion),
            userEvent: 'input.complete',
          });
          insertEditorImage(view);
        },
      });
    if (options.noteLinks)
      actions.push({ label: 'Enlace a nota', apply: '[[' });
    // Match after the slash but replace the whole trigger when accepting.
    return {
      from: slash + 1,
      options: actions.map((option) => ({
        ...option,
        apply(view, completion, from, to) {
          if (typeof option.apply === 'function')
            option.apply(view, completion, from - 1, to);
          else
            view.dispatch({
              changes: {
                from: from - 1,
                to,
                insert: option.apply ?? option.label,
              },
              annotations: pickedCompletion.of(completion),
              userEvent: 'input.complete',
            });
        },
      })),
      validFor: /^[\p{L}\p{N} -]*$/u,
    };
  };
  return [
    imagePicker.of(options.insertImage),
    markdownLanguage.data.of({ autocomplete: source }),
    markdownLanguage.data.of({ autocomplete: completeEmoji }),
    ...(options.noteLinks
      ? [markdownLanguage.data.of({ autocomplete: options.noteLinks })]
      : []),
    autocompletion({
      activateOnTypingDelay: 70,
      activateOnCompletion: (option) => option.label === 'Enlace a nota',
    }),
  ];
}
