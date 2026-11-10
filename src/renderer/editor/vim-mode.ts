import { moveCompletionSelection } from '@codemirror/autocomplete';
import { Facet } from '@codemirror/state';
import { Vim, vim } from '@replit/codemirror-vim';
import { formatSelection } from './formatting';

export type VimAction =
  | 'write'
  | 'next'
  | 'prev'
  | 'preview'
  | 'side-by-side'
  | 'cmd';
type RunVimAction = (action: VimAction, argument?: string) => void;

const actionHandler = Facet.define<RunVimAction>();
for (const [name, prefix] of [
  ['write', 'w'],
  ['next', 'n'],
  ['prev', 'prev'],
  ['preview', 'p'],
  ['side-by-side', 'side'],
  ['cmd', 'cmd'],
] as const) {
  Vim.defineEx(name, prefix, (cm, params) => {
    cm.cm6.state.facet(actionHandler)[0]?.(name, params?.argString?.trim());
  });
}

Vim.defineAction('inknoteInlineCode', (cm) => formatSelection(cm.cm6, 'code'));
Vim.mapCommand('`', 'action', 'inknoteInlineCode', {}, { context: 'visual' });
for (const [key, forward] of [
  ['<C-n>', true],
  ['<C-p>', false],
] as const) {
  const name = forward ? 'inknoteNextCompletion' : 'inknotePreviousCompletion';
  Vim.defineAction(name, (cm) => moveCompletionSelection(forward)(cm.cm6));
  Vim.mapCommand(key, 'action', name, {}, { context: 'insert' });
}

export function vimMode(run: RunVimAction) {
  return [vim({ status: true }), actionHandler.of(run)];
}
