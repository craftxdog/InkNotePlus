import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  shortcutCommands,
  shortcutFor,
  type ShortcutCommand,
} from '../../shared/keybindings';
import { maxNoteTags } from '../../shared/tags';
import { jumpToNoteLine } from '../editor/note-navigation';
import { noteOutline } from '../editor/note-outline';
import { notebookTree } from '../notebooks/notebook-hierarchy';
import {
  parsePaletteQuery,
  type PaletteSource,
} from '../palette/palette-query';
import { executeShortcut } from '../shortcuts';
import { useWorkspace, useWorkspaceStore } from '../state/workspace-context';
import { themeCatalog } from '../themes/catalog';
import { Modal } from './modal';

interface PaletteAction {
  hint: string;
  run: () => void;
}
interface PaletteItem {
  key: string;
  source: PaletteSource;
  label: string;
  detail: string;
  shortcut?: string;
  enter: PaletteAction;
  mod?: PaletteAction;
  shift?: PaletteAction;
}

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
  const books = useWorkspace((state) => state.library.notebooks);
  const tags = useWorkspace((state) => state.library.tags);
  const body = useWorkspace((state) => state.document.body);
  const noteId = useWorkspace((state) => state.document.noteId);
  const installedThemes = useWorkspace((state) => state.installedThemes);
  const pluginCommands = useWorkspace((state) => state.pluginCommands);
  const [query, setQuery] = useState(
    () => store.getState().commandPaletteQuery,
  );
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement);
  const editor = document.querySelector<HTMLElement>(
    '.inknote-shell[data-editor-visible="true"] .editor-layout:not([data-editor-mode="preview"]) .cm-content',
  );
  const editable = !!noteId && !inTrash;
  const outline = useMemo(() => noteOutline(body), [body]);
  const parsed = parsePaletteQuery(query);
  const words = normalized(parsed.search).split(/\s+/).filter(Boolean);
  const items: PaletteItem[] = [
    ...shortcutCommands.flatMap((command): PaletteItem[] => {
      if (command.id === 'core:toggle-telescope') return [];
      if (command.id === 'inknote:import-apple-notes' && platform !== 'darwin')
        return [];
      if (command.scope === 'editor' && (!editor || inTrash)) return [];
      if (command.scope !== 'app' && command.scope !== 'editor') return [];
      return [
        {
          key: `command:${command.id}`,
          source: 'commands',
          label: command.label,
          detail: command.id,
          shortcut: shortcutFor(command, keybindings, platform === 'darwin'),
          enter: { hint: 'Ejecutar', run: () => runCommand(command.id) },
        },
      ];
    }),
    ...pluginCommands.map(({ plugin, name }): PaletteItem => ({
      key: `plugin:${name}`,
      source: 'commands',
      label: name,
      detail: `Plugin ${plugin}`,
      enter: {
        hint: 'Ejecutar',
        run: () => void store.getState().runPluginCommand(name),
      },
    })),
    ...notebookTree(books).map(({ notebook, path }): PaletteItem => ({
      key: `book:${notebook.id}`,
      source: 'books',
      label: notebook.name,
      detail: path.join(' : '),
      enter: {
        hint: 'Abrir',
        run: () =>
          void store.getState().navigate({ type: 'notebook', id: notebook.id }),
      },
      mod: {
        hint: 'Abrir como workspace',
        run: () => void store.getState().focusNotebook(notebook.id),
      },
      ...(editable
        ? {
            shift: {
              hint: 'Mover la nota aquí',
              run: () => void store.getState().moveNotes([noteId], notebook.id),
            },
          }
        : {}),
    })),
    ...tags.map(({ name }): PaletteItem => ({
      key: `tag:${name}`,
      source: 'tags',
      label: name,
      detail: 'Etiqueta',
      enter: {
        hint: 'Ver notas',
        run: () => void store.getState().navigate({ type: 'tag', name }),
      },
      mod: {
        hint: 'Añadir al filtro',
        run: () => {
          const state = store.getState();
          void state.setTagFilter([...state.tagFilter, name]);
        },
      },
      ...(editable
        ? {
            shift: {
              hint: 'Etiquetar la nota',
              run: () => {
                const state = store.getState();
                const { metadata } = state.document;
                if (
                  metadata.tags.includes(name) ||
                  metadata.tags.length >= maxNoteTags
                )
                  return;
                state.updateDraft({
                  metadata: { ...metadata, tags: [...metadata.tags, name] },
                });
                void state.saveDraft();
              },
            },
          }
        : {}),
    })),
    ...outline.map((item): PaletteItem => ({
      key: `toc:${item.line}:${item.kind}`,
      source: 'toc',
      label: item.text,
      detail: `${item.kind === 'task' ? 'Tarea' : 'Encabezado'} · línea ${item.line}`,
      enter: {
        hint: 'Ir a esta posición',
        run: () => jumpToNoteLine(item.line),
      },
    })),
    ...[
      ...new Map(
        [...Object.values(themeCatalog), ...installedThemes].map((theme) => [
          theme.manifest.name,
          theme,
        ]),
      ).values(),
    ].map((theme): PaletteItem => ({
      key: `theme:${theme.manifest.name}`,
      source: 'themes',
      label: theme.label,
      detail: 'Tema',
      enter: {
        hint: 'Aplicar tema',
        run: () =>
          void store
            .getState()
            .updatePreferences({ theme: theme.manifest.name }),
      },
    })),
  ];
  const matches = items
    .flatMap((item) => {
      if (parsed.source && item.source !== parsed.source) return [];
      const label = normalized(`${item.label} ${item.detail}`);
      const score = words.reduce(
        (total, word) => total + scoreWord(label, word),
        0,
      );
      return Number.isFinite(score) ? [{ item, score }] : [];
    })
    .sort((a, b) => a.score - b.score)
    .map(({ item }) => item);
  const active = matches[Math.min(selected, matches.length - 1)];
  const modKey = platform === 'darwin' ? '⌘' : 'Ctrl+';
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active?.key]);
  function runCommand(command: ShortcutCommand) {
    if (editor?.isConnected) editor.focus();
    executeShortcut(store, command, editor);
  }
  const close = (action?: PaletteAction) => {
    store.getState().setCommandPaletteOpen(false);
    requestAnimationFrame(() => {
      if (action) action.run();
      else if (
        opener.current instanceof HTMLElement &&
        opener.current.isConnected
      )
        opener.current.focus();
    });
  };
  const activate = (
    item: PaletteItem,
    event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  ) => {
    const mod = platform === 'darwin' ? event.metaKey : event.ctrlKey;
    close((mod && item.mod) || (event.shiftKey && item.shift) || item.enter);
  };

  return (
    <Modal title="Buscar" className="command-palette" onClose={() => close()}>
      <div className="command-palette-body">
        <input
          ref={input}
          aria-label="Buscar comandos, notebooks, etiquetas, esquema y temas"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          aria-activedescendant={active ? `${listId}-${active.key}` : undefined}
          placeholder="> comandos · b notebooks · t etiquetas · # esquema · h temas"
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
              activate(active, event);
            } else if (event.key === 'Escape') {
              // Step back: search text, then source, then the palette itself.
              event.preventDefault();
              event.stopPropagation();
              setSelected(0);
              if (parsed.search) setQuery(parsed.prefix);
              else if (query) setQuery('');
              else close();
            }
          }}
        />
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Resultados disponibles"
        >
          {matches.map((item) => (
            <button
              type="button"
              key={item.key}
              id={`${listId}-${item.key}`}
              role="option"
              tabIndex={-1}
              aria-selected={active?.key === item.key}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => activate(item, event)}
            >
              <span>
                {item.label}
                <small>{item.detail}</small>
              </span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
        {!matches.length && <p role="status">Sin resultados.</p>}
        {active && (
          <p
            className="command-palette-hints"
            role="status"
            aria-label="Acciones disponibles"
          >
            <span>↵ {active.enter.hint}</span>
            {active.mod && (
              <span>
                {modKey}↵ {active.mod.hint}
              </span>
            )}
            {active.shift && <span>⇧↵ {active.shift.hint}</span>}
          </p>
        )}
      </div>
    </Modal>
  );
}
