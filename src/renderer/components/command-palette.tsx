import { useEffect, useId, useRef, useState } from 'react';
import {
  shortcutCommands,
  shortcutFor,
  type ShortcutCommand,
} from '../../shared/keybindings';
import { executeShortcut } from '../shortcuts';
import { useWorkspace, useWorkspaceStore } from '../state/workspace-context';
import { Modal } from './modal';

function normalized(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

function scoreWord(text: string, word: string) {
  const exact = text.indexOf(word);
  if (exact >= 0) return exact / 100;
  let index = -1;
  let first = -1;
  for (const letter of word) {
    index = text.indexOf(letter, index + 1);
    if (index < 0) return Infinity;
    if (first < 0) first = index;
  }
  return 10 + index - first;
}

export function CommandPalette() {
  const store = useWorkspaceStore();
  const platform = useWorkspace((state) => state.platform);
  const keybindings = useWorkspace((state) => state.preferences.keybindings);
  const inTrash = useWorkspace((state) => state.navigation.type === 'trash');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement);
  const editor = document.querySelector<HTMLElement>(
    '.inknote-shell[data-editor-visible="true"] .editor-layout:not([data-editor-mode="preview"]) .cm-content',
  );
  const words = normalized(query.replace(/^>\s*/, ''))
    .split(/\s+/)
    .filter(Boolean);
  const matches = shortcutCommands
    .flatMap((command) => {
      if (command.id === 'core:toggle-telescope') return [];
      if (command.scope === 'editor' && (!editor || inTrash)) return [];
      if (command.scope !== 'app' && command.scope !== 'editor') return [];
      const label = normalized(`${command.label} ${command.id}`);
      const score = words.reduce(
        (total, word) => total + scoreWord(label, word),
        0,
      );
      return Number.isFinite(score) ? [{ command, score }] : [];
    })
    .sort((a, b) => a.score - b.score)
    .map(({ command }) => command);
  const active = matches[Math.min(selected, matches.length - 1)];
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  const close = (command?: ShortcutCommand) => {
    store.getState().setCommandPaletteOpen(false);
    requestAnimationFrame(() => {
      if (command) {
        if (editor?.isConnected) editor.focus();
        executeShortcut(store, command, editor);
      } else if (
        opener.current instanceof HTMLElement &&
        opener.current.isConnected
      )
        opener.current.focus();
    });
  };

  return (
    <Modal title="Comandos" className="command-palette" onClose={close}>
      <div className="command-palette-body">
        <input
          ref={input}
          aria-label="Buscar comandos"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
          placeholder="Buscar por nombre o comando"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const delta = event.key === 'ArrowDown' ? 1 : -1;
              setSelected((index) =>
                Math.max(0, Math.min(matches.length - 1, index + delta)),
              );
            } else if (event.key === 'Enter' && active) {
              event.preventDefault();
              close(active.id);
            }
          }}
        />
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Comandos disponibles"
        >
          {matches.map((command) => (
            <button
              type="button"
              key={command.id}
              id={`${listId}-${command.id}`}
              role="option"
              tabIndex={-1}
              aria-selected={active?.id === command.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => close(command.id)}
            >
              <span>
                {command.label}
                <small>{command.id}</small>
              </span>
              <kbd>
                {shortcutFor(command, keybindings, platform === 'darwin')}
              </kbd>
            </button>
          ))}
        </div>
        {!matches.length && <p role="status">Ningún comando coincide.</p>}
      </div>
    </Modal>
  );
}
