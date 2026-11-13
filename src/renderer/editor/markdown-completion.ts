import {
  autocompletion,
  pickedCompletion,
  snippet,
  snippetCompletion,
  type Completion,
  type CompletionSource,
  type CompletionSection,
} from '@codemirror/autocomplete';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { Facet } from '@codemirror/state';
import type { Command, EditorView } from '@codemirror/view';
import { alertLabels } from './github-alerts';
import {
  completionPresentation,
  completionSectionHeader,
  completionTheme,
} from './markdown-completion-ui';

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
  snippet(contextTemplate(view, markdownSnippets[command].template, from))(
    view,
    null,
    from,
    to,
  );
  view.focus();
  return true;
}

const formatting: CompletionSection = {
  name: 'Formato básico',
  rank: 0,
  header: completionSectionHeader,
};
const alerts: CompletionSection = {
  name: 'Alertas de GitHub',
  rank: 1,
  header: completionSectionHeader,
};
const inserting: CompletionSection = {
  name: 'Insertar',
  rank: 2,
  header: completionSectionHeader,
};

function contextTemplate(view: EditorView, template: string, from: number) {
  const line = view.state.doc.lineAt(from);
  const prefix = view.state.sliceDoc(line.from, from);
  if (!/^(?: {0,3}>[\t ]?)*[\t ]*$/.test(prefix)) return template;
  // CodeMirror adds the line's leading indentation itself. Continue only the
  // quote markers here, so an indented quote is not indented twice.
  const quote = prefix.replace(/^[\t ]*/, '');
  return template.replaceAll('\n', `\n${quote}`);
}

function option(
  label: string,
  template: string,
  icon: string,
  detail: string,
  section: CompletionSection,
  order: number,
): Completion {
  return {
    ...snippetCompletion(template, { label }),
    section,
    type: `inknote-${icon}`,
    detail,
    sortText: String(order).padStart(2, '0'),
    apply(view, completion, from, to) {
      snippet(contextTemplate(view, template, from))(
        view,
        completion,
        from,
        to,
      );
    },
  };
}

const slashOptions: Completion[] = [
  option(
    'Bloque de código',
    markdownSnippets['core:insert-code-block'].template,
    'code',
    '```',
    formatting,
    0,
  ),
  ...[1, 2, 3, 4].map((level) =>
    option(
      `Encabezado ${level}`,
      '#'.repeat(level) + ' ${texto}',
      'heading',
      '#'.repeat(level),
      formatting,
      level,
    ),
  ),
  option(
    'Separador horizontal',
    markdownSnippets['core:insert-horizontal-rule'].template,
    'rule',
    '---',
    formatting,
    5,
  ),
  option('Lista numerada', '1. ${texto}', 'ordered', '1.', formatting, 6),
  option(
    'Tabla',
    markdownSnippets['core:insert-table'].template,
    'table',
    '| --- |',
    formatting,
    7,
  ),
  option('Lista de tareas', '- [ ] ${tarea}', 'tasks', '- [ ]', formatting, 8),
  option('Lista con viñetas', '- ${texto}', 'unordered', '-', formatting, 9),
  option('Cita', '> ${texto}', 'quote', '>', formatting, 10),
  ...(['caution', 'important', 'note', 'tip', 'warning'] as const).map(
    (type, index) => {
      const item = markdownSnippets[`core:insert-alert-${type}`];
      return option(
        item.label,
        item.template,
        type,
        `> [!${type.toUpperCase()}]`,
        alerts,
        index,
      );
    },
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
    const alert = /^(?:[\t ]*>[\t ]*)+\[!([a-z]*)$/i.exec(before);
    if (alert) {
      return {
        from: pos - alert[1].length,
        to: state.sliceDoc(pos, pos + 1) === ']' ? pos + 1 : pos,
        options: Object.entries(alertLabels).map(([type, label]) => ({
          label: label.toUpperCase(),
          apply: `${label.toUpperCase()}]`,
          type: `inknote-${type}`,
          detail: `[!${label.toUpperCase()}]`,
        })),
      };
    }
    if (
      !/^(?: {0,3}>[\t ]?)* {0,3}\/[\p{L}\p{N} -]*$/u.test(before) ||
      state.sliceDoc(pos, line.to).trim()
    )
      return null;
    const slash = line.from + before.indexOf('/');
    const actions = [...slashOptions];
    if (options.insertImage())
      actions.push({
        label: 'Imagen',
        section: inserting,
        type: 'inknote-image',
        detail: '![…](…)',
        sortText: '01',
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
      actions.push({
        label: 'Enlace a nota',
        apply: '[[',
        section: inserting,
        type: 'inknote-noteLink',
        detail: '[[…]]',
        sortText: '00',
      });
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
    completionTheme,
    imagePicker.of(options.insertImage),
    markdownLanguage.data.of({ autocomplete: source }),
    markdownLanguage.data.of({ autocomplete: completeEmoji }),
    ...(options.noteLinks
      ? [markdownLanguage.data.of({ autocomplete: options.noteLinks })]
      : []),
    autocompletion({
      ...completionPresentation,
      activateOnTypingDelay: 70,
      activateOnCompletion: (option) => option.label === 'Enlace a nota',
    }),
  ];
}
