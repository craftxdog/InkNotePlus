import {
  pickedCompletion,
  type Completion,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { highlightTree } from '@lezer/highlight';
import { noteMarkdownLink } from '../../shared/note-link';
import type { WorkspaceActions } from '../state/workspace-types';
import { prepareMarkdownInsertion } from './image-insertion';
import { tokenHighlighter } from './token-highlighter';

function previewNote(body: string) {
  const preview = document.createElement('pre');
  preview.className = 'note-link-snippet';
  const text = body.slice(0, 1_000);
  let end = 0;
  highlightTree(
    markdownLanguage.parser.parse(text),
    tokenHighlighter,
    (from, to, classes) => {
      if (from > end) preview.append(text.slice(end, from));
      const token = document.createElement('span');
      token.className = classes;
      token.textContent = text.slice(from, to);
      preview.append(token);
      end = to;
    },
  );
  preview.append(text.slice(end));
  return preview;
}

export function noteLinkCompletion(
  actions: Pick<
    WorkspaceActions,
    'searchLinkNotes' | 'createLinkedNote' | 'openNoteLink'
  >,
): CompletionSource {
  return async (context) => {
    const { state, pos } = context;
    if (state.readOnly || state.selection.ranges.length !== 1) return null;
    const trigger = context.matchBefore(/\[\[[^[\]\r\n]{0,120}/);
    if (!trigger) return null;
    const tree = syntaxTree(state);
    for (
      let node: ReturnType<typeof tree.resolve> | null = tree.resolve(pos, -1);
      node;
      node = node.parent
    ) {
      if (
        ['FencedCode', 'CodeBlock', 'InlineCode', 'Link', 'Image'].includes(
          node.name,
        )
      )
        return null;
    }
    const query = trigger.text.slice(2).trim();
    const result = await actions.searchLinkNotes(query);
    if (context.aborted || !result.ok) return null;
    const end = state.sliceDoc(pos, pos + 2) === ']]' ? pos + 2 : pos;
    const options: Completion[] = result.data
      .filter((note) => !note.deletedAt)
      .map((note) => ({
        label: note.title || 'Nota sin título',
        type: 'text',
        apply: noteMarkdownLink(note),
        info: () => previewNote(note.body),
      }));
    if (
      query &&
      !options.some(
        ({ label }) => label.toLocaleLowerCase() === query.toLocaleLowerCase(),
      )
    ) {
      options.push({
        label: `Crear nota «${query}»`,
        apply(view, completion, from, to) {
          const pending = prepareMarkdownInsertion(view, { from, to });
          view.dispatch({ annotations: pickedCompletion.of(completion) });
          void actions
            .createLinkedNote(query)
            .then(async (created) => {
              if (
                view.dom.isConnected &&
                created.ok &&
                pending.insert(noteMarkdownLink(created.data))
              ) {
                await actions.openNoteLink(`inknote://note/${created.data.id}`);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (view.dom.isConnected) pending.dispose();
            });
        },
      });
    }
    return { from: trigger.from, to: end, options, filter: false };
  };
}
