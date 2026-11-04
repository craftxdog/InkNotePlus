import { EditorView } from '@codemirror/view';
import {
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
} from '@codemirror/search';
import type { WorkspaceStoreApi } from './state/workspace-store';
import {
  shortcutCommands,
  shortcutFor,
  type ShortcutCommand,
} from '../shared/keybindings';
import { formatSelection } from './editor/formatting';

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
      (/^[1-5]$/.test(key) && event.code === `Digit${key}`)) &&
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
    case 'core:save-note':
      void state.flushDrafts();
      return true;
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
    default: {
      const element =
        target instanceof Element ? target.closest('.cm-editor') : null;
      const view = element && EditorView.findFromDOM(element as HTMLElement);
      if (!view || state.navigation.type === 'trash') return false;
      if (command === 'editor:find') return openSearchPanel(view);
      if (command === 'editor:close-search') return closeSearchPanel(view);
      if (command === 'editor:find-next') return findNext(view);
      if (command === 'editor:find-previous') return findPrevious(view);
      const format = {
        'editor:toggle-bold': 'bold',
        'editor:toggle-italic': 'italic',
        'editor:toggle-strikethrough': 'strike',
        'editor:insert-link': 'link',
      } as const;
      formatSelection(view, format[command]);
      return true;
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
  const reset = () => {
    prefix = [];
    clearTimeout(timer);
  };
  const listener = (event: KeyboardEvent) => {
    if (
      event.isComposing ||
      event.defaultPrevented ||
      ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)
    )
      return;
    const state = store.getState();
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[data-shortcut-input]')) return;
    const editor = !!element?.closest('.cm-editor');
    const list = !!element?.closest('.note-list-item');
    const search = !!element?.closest('#note-search');
    const commands = shortcutCommands
      .filter(
        (command) =>
          ((!state.settingsOpen && !state.templatePickerOpen) ||
            command.id === 'application:open-preferences') &&
          (command.scope === 'app' ||
            (command.scope === 'editor' && editor) ||
            (command.scope === 'note-list' && list) ||
            (command.scope === 'search' && search)),
      )
      .toSorted(
        (a, b) => Number(b.scope === 'editor') - Number(a.scope === 'editor'),
      );
    const matches = commands
      .map((command) => ({
        command,
        keys: shortcutFor(
          command,
          state.preferences.keybindings,
          state.platform === 'darwin',
        ).split(' '),
      }))
      .filter(
        ({ keys }) =>
          prefix.every((key, index) => keys[index] === key) &&
          keystrokeMatches(
            keys[prefix.length] ?? '',
            event,
            state.platform === 'darwin',
          ),
      );
    if (!matches.length) {
      reset();
      return;
    }
    const complete = matches.find(
      (match) => match.keys.length === prefix.length + 1,
    );
    if (complete) {
      reset();
      if (!executeShortcut(store, complete.command.id, event.target)) return;
    } else {
      prefix.push(matches[0].keys[prefix.length]);
      clearTimeout(timer);
      timer = setTimeout(reset, 1000);
    }
    event.preventDefault();
    event.stopPropagation();
  };
  surface.addEventListener('keydown', listener, true);
  surface.addEventListener('blur', reset);
  return () => {
    reset();
    surface.removeEventListener('keydown', listener, true);
    surface.removeEventListener('blur', reset);
  };
}
