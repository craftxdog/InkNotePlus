import * as commands from '@codemirror/commands';
import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import {
  acceptCompletion,
  closeCompletion,
  moveCompletionSelection,
  startCompletion,
} from '@codemirror/autocomplete';
import {
  getSearchQuery,
  gotoLine,
  openSearchPanel,
  replaceAll,
  replaceNext,
  SearchQuery,
  selectNextOccurrence,
  selectSelectionMatches,
  setSearchQuery,
} from '@codemirror/search';
import type { Command } from '@codemirror/view';
import type { EditingCommand } from '../../shared/editor-keybindings';
import { formatSelection, type FormatCommand } from './formatting';
import { toggleHighlight } from './highlights';
import { resizeCurrentImage } from './image-dimensions';
import { indentMarkdown, outdentMarkdown } from './list-indentation';
import {
  insertEditorImage,
  insertSnippet,
  type markdownSnippets,
} from './markdown-completion';
import { tableCommands } from './table-editor';
import {
  centerCursor,
  changeCase,
  findUnder,
  insertLineBefore,
  joinLines,
  linkAtCursor,
  scrollOneLine,
  selectMatchingBracket,
  sortLines,
  splitSelectionByLine,
} from './text-commands';

const format =
  (action: FormatCommand): Command =>
  (view) => {
    if (view.state.readOnly) return false;
    formatSelection(view, action);
    return true;
  };
const snippet =
  (id: keyof typeof markdownSnippets): Command =>
  (view) =>
    insertSnippet(view, id);
const resize =
  (size: Parameters<typeof resizeCurrentImage>[1]): Command =>
  (view) =>
    resizeCurrentImage(view, size);

function searchOption(option: 'regexp' | 'caseSensitive' | 'clear'): Command {
  return (view) => {
    const query = getSearchQuery(view.state);
    const updated = new SearchQuery(
      option === 'clear'
        ? { ...query, search: '' }
        : { ...query, [option]: !query[option] },
    );
    view.dispatch({ effects: setSearchQuery.of(updated) });
    return true;
  };
}

export const editorCommands: Record<
  | Exclude<EditingCommand, 'editor:open-link'>
  | 'core:strong'
  | 'core:emphasize'
  | 'core:strikethrough'
  | 'core:insert-link',
  Command
> = {
  'core:strong': format('bold'),
  'core:emphasize': format('italic'),
  'core:strikethrough': format('strike'),
  'core:insert-link': format('link'),
  'core:toggle-heading-1': format('heading-1'),
  'core:toggle-heading-2': format('heading'),
  'core:toggle-heading-3': format('heading-3'),
  'core:toggle-heading-4': format('heading-4'),
  'core:toggle-heading-bigger': format('heading-bigger'),
  'core:toggle-heading-smaller': format('heading-smaller'),
  'core:toggle-blockquote': format('quote'),
  'core:toggle-bulleted-list': format('bullet'),
  'core:toggle-numbered-list': format('ordered'),
  'core:toggle-task-list': format('task'),
  'core:toggle-inline-code': format('code'),
  'core:toggle-inline-mark-tag': toggleHighlight,
  'core:insert-alert-note': snippet('core:insert-alert-note'),
  'core:insert-alert-tip': snippet('core:insert-alert-tip'),
  'core:insert-alert-important': snippet('core:insert-alert-important'),
  'core:insert-alert-warning': snippet('core:insert-alert-warning'),
  'core:insert-alert-caution': snippet('core:insert-alert-caution'),
  'core:insert-code-block': snippet('core:insert-code-block'),
  'core:insert-image': insertEditorImage,
  'core:insert-horizontal-rule': format('rule'),
  'core:insert-table': snippet('core:insert-table'),
  'editor:indent-more': indentMarkdown,
  'editor:indent-less': outdentMarkdown,
  'editor:new-line-continue-markup': (view) =>
    insertNewlineContinueMarkup(view) || commands.insertNewlineAndIndent(view),
  'editor:copy-line-up': commands.copyLineUp,
  'editor:copy-line-down': commands.copyLineDown,
  'editor:move-line-up': commands.moveLineUp,
  'editor:move-line-down': commands.moveLineDown,
  'editor:delete-line': commands.deleteLine,
  'editor:join-lines': joinLines,
  'editor:insert-line-before': insertLineBefore,
  'editor:insert-blank-line': commands.insertBlankLine,
  'editor:new-line': commands.insertNewline,
  'editor:open-line': commands.splitLine,
  'editor:kill-line': commands.deleteToLineEnd,
  'editor:delete-char-after': commands.deleteCharForward,
  'editor:delete-char-before': commands.deleteCharBackward,
  'editor:delete-group-after': commands.deleteGroupForward,
  'editor:delete-group-before': commands.deleteGroupBackward,
  'editor:delete-word-after': commands.deleteGroupForward,
  'editor:delete-word-before': commands.deleteGroupBackward,
  'editor:delete-wrapped-line-left': commands.deleteLineBoundaryBackward,
  'editor:delete-wrapped-line-right': commands.deleteLineBoundaryForward,
  'editor:upcase-at-cursor': changeCase(true),
  'editor:downcase-at-cursor': changeCase(false),
  'editor:sort-lines': sortLines(false, true),
  'editor:reverse-sort-lines': sortLines(true, true),
  'editor:sort-lines-insensitive': sortLines(false, false),
  'editor:reverse-sort-lines-insensitive': sortLines(true, false),
  'editor:transpose-chars': commands.transposeChars,
  'editor:toggle-comment': commands.toggleComment,
  'editor:toggle-line-comment': commands.toggleLineComment,
  'editor:toggle-regex': searchOption('regexp'),
  'editor:toggle-case-sensitive': searchOption('caseSensitive'),
  'editor:clear-find': searchOption('clear'),
  'editor:replace': (view) => {
    openSearchPanel(view);
    view.dom.querySelector<HTMLInputElement>('input[name="replace"]')?.focus();
    return true;
  },
  'editor:replace-next': replaceNext,
  'editor:replace-all': replaceAll,
  'editor:jump-to-line': gotoLine,
  'editor:find-under': findUnder(),
  'editor:find-under-previous': findUnder(true),
  'editor:select-next-occurrence': selectNextOccurrence,
  'editor:select-selection-matches': selectSelectionMatches,
  'editor:skip-and-select-next-occurrence': findUnder(false, true),
  'editor:split-selection-by-line': splitSelectionByLine,
  'editor:select-lines-upward': commands.addCursorAbove,
  'editor:select-lines-downward': commands.addCursorBelow,
  'editor:single-selection': commands.simplifySelection,
  'editor:go-char-left': commands.cursorCharLeft,
  'editor:go-char-right': commands.cursorCharRight,
  'editor:go-group-left': commands.cursorGroupLeft,
  'editor:go-group-right': commands.cursorGroupRight,
  'editor:go-subword-left': commands.cursorSubwordBackward,
  'editor:go-subword-right': commands.cursorSubwordForward,
  'editor:go-syntax-left': commands.cursorSyntaxLeft,
  'editor:go-syntax-right': commands.cursorSyntaxRight,
  'editor:go-line-up': commands.cursorLineUp,
  'editor:go-line-down': commands.cursorLineDown,
  'editor:go-line-start': commands.cursorLineStart,
  'editor:go-line-end': commands.cursorLineEnd,
  'editor:go-line-left': commands.cursorLineBoundaryBackward,
  'editor:go-line-right': commands.cursorLineBoundaryForward,
  'editor:go-page-up': commands.cursorPageUp,
  'editor:go-page-down': commands.cursorPageDown,
  'editor:go-doc-start': commands.cursorDocStart,
  'editor:go-doc-end': commands.cursorDocEnd,
  'editor:select-char-left': commands.selectCharLeft,
  'editor:select-char-right': commands.selectCharRight,
  'editor:select-group-left': commands.selectGroupLeft,
  'editor:select-group-right': commands.selectGroupRight,
  'editor:select-subword-left': commands.selectSubwordBackward,
  'editor:select-subword-right': commands.selectSubwordForward,
  'editor:select-syntax-left': commands.selectSyntaxLeft,
  'editor:select-syntax-right': commands.selectSyntaxRight,
  'editor:select-line-up': commands.selectLineUp,
  'editor:select-line-down': commands.selectLineDown,
  'editor:select-line-start': commands.selectLineStart,
  'editor:select-line-end': commands.selectLineEnd,
  'editor:select-line-left': commands.selectLineBoundaryBackward,
  'editor:select-line-right': commands.selectLineBoundaryForward,
  'editor:select-page-up': commands.selectPageUp,
  'editor:select-page-down': commands.selectPageDown,
  'editor:select-doc-start': commands.selectDocStart,
  'editor:select-doc-end': commands.selectDocEnd,
  'editor:select-all': commands.selectAll,
  'editor:select-line': commands.selectLine,
  'editor:select-parent-syntax': commands.selectParentSyntax,
  'editor:go-matching-bracket': commands.cursorMatchingBracket,
  'editor:select-matching-bracket': selectMatchingBracket,
  'editor:scroll-line-up': scrollOneLine(-1),
  'editor:scroll-line-down': scrollOneLine(1),
  'editor:show-in-center': centerCursor,
  'editor:undo-selection': commands.undoSelection,
  'editor:redo-selection': commands.redoSelection,
  'core:undo': commands.undo,
  'core:redo': commands.redo,
  'editor:copy-link': (view) => {
    const url = linkAtCursor(view);
    if (!url || !navigator.clipboard) return false;
    void navigator.clipboard.writeText(url).catch(() => {});
    return true;
  },
  'editor:resize-image-auto': resize(''),
  'editor:resize-image-small': resize('30%'),
  'editor:resize-image-half': resize('50%'),
  'editor:resize-image-full': resize('100%'),
  'editor:start-completion': startCompletion,
  'editor:accept-completion': acceptCompletion,
  'editor:close-completion': closeCompletion,
  'editor:move-completion-selection-up': moveCompletionSelection(false),
  'editor:move-completion-selection-down': moveCompletionSelection(true),
  'editor:move-completion-selection-page-up': moveCompletionSelection(
    false,
    'page',
  ),
  'editor:move-completion-selection-page-down': moveCompletionSelection(
    true,
    'page',
  ),
  ...tableCommands,
};
