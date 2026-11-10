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
  shortcutCommands,
  shortcutFor,
  type ShortcutCommand,
} from '../shared/keybindings';
import { editorCommands } from './editor/editor-commands';
import { linkAtCursor } from './editor/text-commands';
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

export function executeShortcut(
  store: WorkspaceStoreApi,
  command: ShortcutCommand,
  target: EventTarget | null,
): boolean {
  const state = store.getState();
  switch (command) {
    case 'core:toggle-telescope':
      state.setCommandPaletteOpen(!state.commandPaletteOpen);
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
    case 'core:save-note':
      void state.flushDrafts();
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
      if (!noteId || !navigator.clipboard || state.navigation.type === 'trash')
        return false;
      void navigator.clipboard
        .writeText(noteMarkdownLink({ id: noteId, title }))
        .catch(() => {});
      return true;
    }
    case 'core:focus-search':
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
    case 'core:pin-note':
      state.togglePin();
      return true;
    case 'editor:toggle-drawer': {
      const drawer = document.querySelector<HTMLDetailsElement>('.editor-more');
      if (!drawer) return false;
      drawer.open = !drawer.open;
      if (drawer.open)
        drawer.querySelector<HTMLButtonElement>('.popover button')?.focus();
      return true;
    }
    case 'editor:status-none':
      state.setNoteStatus('none');
      return true;
    case 'editor:status-active':
      state.setNoteStatus('active');
      return true;
    case 'editor:status-onhold':
      state.setNoteStatus('onhold');
      return true;
    case 'editor:status-completed':
      state.setNoteStatus('completed');
      return true;
    case 'editor:status-dropped':
      state.setNoteStatus('dropped');
      return true;
    case 'view:toggle-sidebar':
      state.setSidebarVisible(!state.mainLayout.sidebarVisible);
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
      ({ command, keys }) =>
        ((!state.settingsOpen &&
          !state.templatePickerOpen &&
          !state.commandPaletteOpen &&
          !state.notebookDialogOpen) ||
          (state.settingsOpen &&
            command.id === 'application:open-preferences') ||
          (state.commandPaletteOpen &&
            command.id === 'core:toggle-telescope')) &&
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
      if (
        (id === 'editor:indent-more' || id === 'editor:indent-less') &&
        complete.keys.length === 1 &&
        complete.keys[0] === markdownTabKeys[id]
      )
        return;
      const repeatedFormat =
        event.repeat &&
        (id.startsWith('core:toggle-') ||
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
  const listener = (event: KeyboardEvent) => handle(event);
  const afterVim = (event: KeyboardEvent) => handle(event, true);
  surface.addEventListener('keydown', listener, true);
  surface.addEventListener('keydown', afterVim);
  surface.addEventListener('blur', reset);
  return () => {
    reset();
    surface.removeEventListener('keydown', listener, true);
    surface.removeEventListener('keydown', afterVim);
    surface.removeEventListener('blur', reset);
  };
}
