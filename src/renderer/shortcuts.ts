import { EditorView } from '@codemirror/view';
import {
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
  searchPanelOpen,
} from '@codemirror/search';
import type { WorkspaceStoreApi } from './state/workspace-store';
import {
  noteSortCommands,
  resolveShortcutCommand,
  shortcutCommands,
  shortcutFor,
  type ShortcutCommand,
} from '../shared/keybindings';
import { editorCommands } from './editor/editor-commands';
import { requestAiSuggestion } from './editor/ai-suggestion';
import { linkAtCursor } from './editor/text-commands';
import { copyText } from './editor/clipboard';
import { linkedNoteId, noteMarkdownLink } from '../shared/note-link';
import { markdownTabKeys } from '../shared/editor-keybindings';

export function keystrokeMatches(
  stroke: string,
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  > & { code?: string },
  mac: boolean,
) {
  const parts = stroke.match(/^(?:(?:Mod|Ctrl|Alt|Shift|Meta)-)*/)?.[0] ?? '';
  const key = stroke.slice(parts.length);
  const modifiers = new Set(parts.split('-').filter(Boolean));
  return (
    (event.key.toLowerCase() === key?.toLowerCase() ||
      (/^[1-5]$/.test(key) && event.code === `Digit${key}`) ||
      // Option turns letters into symbols on macOS, so compare the physical key.
      (mac &&
        event.altKey &&
        /^[a-z]$/.test(key) &&
        event.code === `Key${key.toUpperCase()}`) ||
      (mac && event.altKey && key === '\\' && event.code === 'Backslash') ||
      (key === '[' && event.key === '{') ||
      (key === ']' && event.key === '}')) &&
    event.metaKey ===
      (modifiers.has('Meta') || (mac && modifiers.has('Mod'))) &&
    event.ctrlKey ===
      (modifiers.has('Ctrl') || (!mac && modifiers.has('Mod'))) &&
    event.altKey === modifiers.has('Alt') &&
    event.shiftKey === modifiers.has('Shift')
  );
}

// Cmd+Arrow moves the caret to the line boundary in every macOS text field.
function keepsNativeCaretMovement(
  command: ShortcutCommand,
  target: Element | null,
) {
  return (
    (command === 'core:navigate-back' || command === 'core:navigate-forward') &&
    !!target?.closest('.cm-content, input, textarea, [contenteditable="true"]')
  );
}

// Dialogs own the keyboard. Only the shortcut that closes each one stays active.
function commandAllowed(
  state: ReturnType<WorkspaceStoreApi['getState']>,
  command: ShortcutCommand,
) {
  return (
    (!state.settingsOpen &&
      !state.templatePickerOpen &&
      !state.commandPaletteOpen &&
      !state.imageViewer &&
      !state.revisionsOpen &&
      !state.aiAssistant &&
      !state.githubSnippetOpen &&
      !state.libraryDialog &&
      !state.notebookDialogOpen) ||
    (state.settingsOpen && command === 'application:open-preferences') ||
    (state.commandPaletteOpen && command === 'core:toggle-telescope')
  );
}

// How far the selector's element is from the focus, or -1 when it does not apply.
function selectorDistance(selector: string, element: Element) {
  try {
    const match = element.closest(selector);
    if (!match) return -1;
    let distance = 0;
    for (let node: Element | null = element; node !== match; distance++)
      node = node?.parentElement ?? null;
    return distance;
  } catch {
    return -1;
  }
}

export function executeShortcut(
  store: WorkspaceStoreApi,
  command: ShortcutCommand,
  target: EventTarget | null,
): boolean {
  const state = store.getState();
  switch (command) {
    case 'window:reload':
      void state.reloadWindow();
      return true;
    case 'core:navigate-back':
    case 'core:navigate-forward':
      void state.navigateHistory(command === 'core:navigate-back' ? -1 : 1);
      return true;
    case 'core:toggle-telescope':
      state.setCommandPaletteOpen(!state.commandPaletteOpen);
      return true;
    case 'core:telescope-commands':
      state.setCommandPaletteOpen(true, '> ');
      return true;
    case 'core:telescope-notebooks':
      state.setCommandPaletteOpen(true, 'b ');
      return true;
    case 'core:telescope-tags':
      state.setCommandPaletteOpen(true, 't ');
      return true;
    case 'telescope-toc:show':
      state.setCommandPaletteOpen(true, '# ');
      return true;
    case 'telescope-themes:show':
      state.setCommandPaletteOpen(true, 'h ');
      return true;
    case 'import-markdown:import-from-file':
      void state.importNotes('files');
      return true;
    case 'inknote:import-folder':
      void state.importNotes('folder');
      return true;
    case 'inknote:import-apple-notes':
      if (state.platform !== 'darwin') return false;
      void state.importNotes('apple-notes');
      return true;
    case 'core:open-note-in-window':
      if (!state.activeNoteId || state.navigation.type === 'trash')
        return false;
      void state.openNoteWindow(state.activeNoteId);
      return true;
    case 'export-as-markdown:all':
    case 'export-as-html:all':
      void state.exportNotes({
        format: command === 'export-as-html:all' ? 'html' : 'markdown',
        scope: { kind: 'all' },
      });
      return true;
    case 'core:show-note-revisions':
      if (!state.document.noteId || state.navigation.type === 'trash')
        return false;
      state.setRevisionsOpen(true);
      return true;
    case 'preview:find':
      if (!state.document.noteId || state.preferences.editorMode === 'edit')
        return false;
      state.setPreviewFindOpen(true);
      document.querySelector<HTMLInputElement>('.preview-find input')?.select();
      return true;
    case 'view:toggle-outline':
      state.setOutlineOpen(!state.outlineOpen);
      return true;
    case 'application:open-preferences':
      if (state.settingsOpen && document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      state.setSettingsOpen(!state.settingsOpen);
      return true;
    case 'core:new-note':
      void state.createNote();
      return true;
    case 'core:choose-template':
      state.setTemplatePickerOpen(true);
      return true;
    case 'core:open-prev-note':
    case 'core:open-next-note': {
      const notes = state.noteList.notes;
      const current = notes.findIndex(({ id }) => id === state.activeNoteId);
      const next =
        notes[current + (command === 'core:open-next-note' ? 1 : -1)];
      if (!next) return false;
      state.selectNote(next.id);
      return true;
    }
    case 'view:sort-by-title-in-asc':
    case 'view:sort-by-title-in-desc':
    case 'view:sort-by-date-created-in-asc':
    case 'view:sort-by-date-created-in-desc':
    case 'view:sort-by-date-updated-in-asc':
    case 'view:sort-by-date-updated-in-desc':
      void state.setNoteSort(noteSortCommands[command]);
      return true;
    case 'core:save-note':
      void state.flushDrafts();
      return true;
    case 'core:duplicate-note':
      if (
        state.navigation.type === 'trash' ||
        (!state.activeNoteId && !state.selectedNoteIds.length)
      )
        return false;
      void state.duplicateNotes();
      return true;
    case 'editor:toggle-line-wrapping':
      void state.updatePreferences({
        lineWrapping:
          state.preferences.lineWrapping === 'off' ? 'cursor' : 'off',
      });
      return true;
    case 'editor:toggle-line-numbers':
      void state.updatePreferences({
        lineNumbers: !state.preferences.lineNumbers,
      });
      return true;
    case 'editor:toggle-readable-line-length':
      void state.updatePreferences({
        readableLineLength: !state.preferences.readableLineLength,
      });
      return true;
    case 'core:copy-note-link': {
      const { noteId, title } = state.document;
      if (!noteId || state.navigation.type === 'trash') return false;
      void copyText(noteMarkdownLink({ id: noteId, title }));
      return true;
    }
    case 'core:find':
      void state.setSearchGlobal(false);
      document.querySelector<HTMLInputElement>('#note-search')?.focus();
      return true;
    case 'core:find-global':
      void state.setSearchGlobal(true);
      document.querySelector<HTMLInputElement>('#note-search')?.focus();
      return true;
    case 'core:find-clear':
      void state.setSearchQuery('');
      return true;
    case 'core:pin-note-to-top':
      state.togglePin();
      return true;
    case 'ai:assistant':
    case 'ai:suggest':
    case 'github:insert-snippet': {
      const element = document.querySelector<HTMLElement>('.cm-editor');
      const view = element && EditorView.findFromDOM(element);
      if (!view || state.navigation.type === 'trash') return false;
      if (command === 'github:insert-snippet') {
        state.setGithubSnippetOpen(true);
        return true;
      }
      if (!state.preferences.aiEnabled) return false;
      if (command === 'ai:suggest') return requestAiSuggestion(view);
      const { from, to, empty } = view.state.selection.main;
      const range = empty
        ? { from: 0, to: view.state.doc.length }
        : { from, to };
      state.setAiAssistant({
        ...range,
        text: view.state.sliceDoc(range.from, range.to),
      });
      return true;
    }
    case 'core:move-note':
    case 'core:move-note-from-list':
      if (state.navigation.type === 'trash') return false;
      return state.openNoteAction('move-notes');
    case 'core:delete-note':
      return state.openNoteAction(
        state.navigation.type === 'trash' ? 'delete' : 'trash',
      );
    case 'core:show-editor-action-menu': {
      const drawer = document.querySelector<HTMLDetailsElement>('.editor-more');
      if (!drawer) return false;
      drawer.open = !drawer.open;
      if (drawer.open)
        drawer.querySelector<HTMLButtonElement>('.popover button')?.focus();
      return true;
    }
    case 'editor:change-note-status-none':
      state.setNoteStatus('none');
      return true;
    case 'editor:change-note-status-active':
      state.setNoteStatus('active');
      return true;
    case 'editor:change-note-status-onhold':
      state.setNoteStatus('onhold');
      return true;
    case 'editor:change-note-status-completed':
      state.setNoteStatus('completed');
      return true;
    case 'editor:change-note-status-dropped':
      state.setNoteStatus('dropped');
      return true;
    case 'view:toggle-sidebar':
      state.toggleSidebar(
        document.querySelector<HTMLElement>('.inknote-shell')?.clientWidth ||
          window.innerWidth,
      );
      return true;
    case 'view:toggle-distraction-free':
      state.setDistractionFreeEnabled(!state.mainLayout.distractionFreeEnabled);
      return true;
    case 'view:toggle-preview':
      void state.updatePreferences({
        editorMode:
          state.preferences.editorMode === 'preview' ? 'edit' : 'preview',
      });
      return true;
    case 'view:toggle-side-by-side':
      void state.updatePreferences({
        editorMode: state.preferences.editorMode === 'split' ? 'edit' : 'split',
      });
      return true;
    case 'view:show-editor':
    case 'view:show-side-by-side':
    case 'view:show-preview':
      void state.updatePreferences({
        editorMode:
          command === 'view:show-editor'
            ? 'edit'
            : command === 'view:show-preview'
              ? 'preview'
              : 'split',
      });
      return true;
    case 'editor:focus-title':
      document.querySelector<HTMLElement>('.document-title-input')?.focus();
      return true;
    case 'editor:focus':
    case 'editor:focus-mde':
    case 'editor:focus-preview':
    case 'editor:focus-and-go-doc-start': {
      const preview =
        command === 'editor:focus-preview' ||
        (command === 'editor:focus' &&
          state.preferences.editorMode === 'preview');
      if (preview && state.preferences.editorMode === 'edit')
        void state.updatePreferences({ editorMode: 'preview' });
      if (!preview && state.preferences.editorMode === 'preview')
        void state.updatePreferences({ editorMode: 'edit' });
      requestAnimationFrame(() => {
        if (preview)
          document.querySelector<HTMLElement>('.pane--preview')?.focus();
        else {
          const element = document.querySelector<HTMLElement>('.cm-editor');
          const view = element && EditorView.findFromDOM(element);
          if (!view) return;
          if (command === 'editor:focus-and-go-doc-start')
            view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
          view.focus();
        }
      });
      return true;
    }
    default: {
      const element =
        target instanceof Element ? target.closest('.cm-editor') : null;
      const view = element && EditorView.findFromDOM(element as HTMLElement);
      if (!view || state.navigation.type === 'trash') return false;
      if (command === 'editor:find')
        return searchPanelOpen(view.state)
          ? closeSearchPanel(view)
          : openSearchPanel(view);
      if (command === 'editor:close-search') return closeSearchPanel(view);
      if (command === 'editor:find-next') return findNext(view);
      if (command === 'editor:find-prev') return findPrevious(view);
      if (command === 'editor:open-link') {
        const url = linkAtCursor(view);
        if (!url) return false;
        if (linkedNoteId(url)) void state.openNoteLink(url);
        else void state.openExternalLink(url);
        return true;
      }
      return editorCommands[command](view);
    }
  }
}

// Contextual keymaps stay outside CodeMirror so the same registry powers
// Preferences, overrides and application commands. Native editing keys fall
// through to the editor/platform when no registered command matches.
export function installShortcuts(
  store: WorkspaceStoreApi,
  surface: Window = window,
) {
  let prefix: string[] = [];
  let lastKeyboard: { id: ShortcutCommand; at: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bindings:
    | ReturnType<WorkspaceStoreApi['getState']>['preferences']['keybindings']
    | undefined;
  let platform: string | undefined;
  let shortcuts: {
    command: (typeof shortcutCommands)[number];
    keys: string[];
    custom: boolean;
  }[] = [];
  const reset = () => {
    prefix = [];
    clearTimeout(timer);
  };
  const handle = (event: KeyboardEvent, afterEditor = false) => {
    if (
      event.isComposing ||
      event.defaultPrevented ||
      ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)
    )
      return;
    const state = store.getState();
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[data-shortcut-input]')) return;
    const editor = !!element?.closest('.cm-content');
    const editorPanel = !!element?.closest('.cm-panel.cm-search');
    const list = !!element?.closest('.note-list-item');
    const search = !!element?.closest('#note-search');
    const vimFirst =
      editor &&
      state.preferences.keyboardMode === 'vim' &&
      !event.metaKey &&
      (event.ctrlKey || event.key === 'Escape');
    if (vimFirst !== afterEditor) return;
    if (commandAllowed(state, 'core:new-note')) {
      const mac = state.platform === 'darwin';
      const focus = element ?? document.body;
      let best: { keys: string[]; command: string; distance: number } | null =
        null;
      // keymap.json comes last, so the user's own shortcuts win a tie.
      for (const entry of [
        ...Object.values(state.pluginKeymaps).flat(),
        ...state.keymap.entries,
      ]) {
        const keys = entry.keystroke.split(' ');
        if (
          !prefix.every((key, index) => keys[index] === key) ||
          !keystrokeMatches(keys[prefix.length] ?? '', event, mac)
        )
          continue;
        const distance = selectorDistance(entry.selector, focus);
        // The closest selector wins, and later entries win a tie.
        if (distance >= 0 && (!best || distance <= best.distance))
          best = { keys, command: entry.command, distance };
      }
      if (best) {
        if (best.keys.length > prefix.length + 1) {
          prefix.push(best.keys[prefix.length]);
          clearTimeout(timer);
          timer = setTimeout(reset, 1000);
        } else {
          reset();
          if (best.command === 'native!' || best.command === 'unset!') return;
          const id = resolveShortcutCommand(best.command);
          if (
            !id &&
            best.command !== 'abort!' &&
            !state.runPluginCommand(best.command)
          )
            return;
          if (id) {
            lastKeyboard = { id, at: performance.now() };
            if (!executeShortcut(store, id, event.target)) return;
          }
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (
      bindings !== state.preferences.keybindings ||
      platform !== state.platform
    ) {
      bindings = state.preferences.keybindings;
      platform = state.platform;
      reset();
      const overrides = new Set(bindings.map(({ command }) => command));
      shortcuts = shortcutCommands
        .map((command) => ({
          command,
          custom: overrides.has(command.id),
          keys: shortcutFor(
            command,
            state.preferences.keybindings,
            state.platform === 'darwin',
          ).split(' '),
        }))
        .filter(({ keys }) => !!keys[0])
        .sort(
          (a, b) =>
            Number(b.command.scope === 'editor') -
            Number(a.command.scope === 'editor'),
        );
    }
    let matches = shortcuts.filter(
      ({ command, keys, custom }) =>
        (custom ||
          state.platform !== 'darwin' ||
          !keepsNativeCaretMovement(command.id, element)) &&
        commandAllowed(state, command.id) &&
        (command.scope === 'app' ||
          (command.scope === 'editor' &&
            (editor ||
              (editorPanel &&
                /^(editor:(?:find|close-search|replace|clear-find|toggle-regex|toggle-case-sensitive))/.test(
                  command.id,
                )))) ||
          (command.scope === 'note-list' && list) ||
          (command.scope === 'search' && search)) &&
        prefix.every((key, index) => keys[index] === key) &&
        keystrokeMatches(
          keys[prefix.length] ?? '',
          event,
          state.platform === 'darwin',
        ),
    );
    if (matches.some(({ custom }) => custom))
      matches = matches.filter(({ custom }) => custom);
    if (!matches.length) {
      reset();
      return;
    }
    const complete = matches.find(
      (match) => match.keys.length === prefix.length + 1,
    );
    if (complete) {
      reset();
      const id = complete.command.id;
      lastKeyboard = { id, at: performance.now() };
      if (
        (id === 'editor:indent-more' || id === 'editor:indent-less') &&
        complete.keys.length === 1 &&
        complete.keys[0] === markdownTabKeys[id]
      )
        return;
      const repeatedFormat =
        event.repeat &&
        (id.startsWith('core:toggle-') ||
          id === 'core:duplicate-note' ||
          id === 'core:strong' ||
          id === 'core:emphasize' ||
          id === 'core:strikethrough');
      if (
        !repeatedFormat &&
        !executeShortcut(store, complete.command.id, event.target)
      )
        return;
    } else {
      prefix.push(matches[0].keys[prefix.length]);
      clearTimeout(timer);
      timer = setTimeout(reset, 1000);
    }
    event.preventDefault();
    event.stopPropagation();
  };
  const stopMenu = store.getState().onMenuCommand((value) => {
    const id = resolveShortcutCommand(value);
    if (!id || !commandAllowed(store.getState(), id)) return;
    // A menu accelerator can follow the key event that already ran this command.
    if (lastKeyboard?.id === id && performance.now() - lastKeyboard.at < 400)
      return;
    const target = document.activeElement;
    executeShortcut(
      store,
      id === 'editor:find' && !target?.closest('.cm-editor')
        ? 'preview:find'
        : id,
      target,
    );
  });
  const listener = (event: KeyboardEvent) => handle(event);
  const afterVim = (event: KeyboardEvent) => handle(event, true);
  surface.addEventListener('keydown', listener, true);
  surface.addEventListener('keydown', afterVim);
  surface.addEventListener('blur', reset);
  return () => {
    reset();
    stopMenu();
    surface.removeEventListener('keydown', listener, true);
    surface.removeEventListener('keydown', afterVim);
    surface.removeEventListener('blur', reset);
  };
}
