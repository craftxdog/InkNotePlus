import { memo, useEffect, useState } from 'react';
import {
  PanelLeft,
  SquarePen,
  Search,
  Pin,
  ListFilter,
  ClipboardCheck,
  Filter,
} from 'lucide-react';
import {
  parseNoteSearch,
  searchHighlightTerms,
} from '../../shared/note-search';
import { HighlightedText } from './highlighted-text';
import { ContextMenu } from './context-menu';
import { builtinTemplates } from '../templates/builtin-templates';
import { UiSlot } from '../extensions/ui-slots';
import type { AppErrorCode, NoteProjection } from '../../shared/ipc';
import { useWorkspace } from '../state/workspace-context';
import { IconButton } from './icon-button';
import { TagBadge } from './tag-badge';
import { statusLabels, statusIcons } from './note-status';

export function NoteList({
  onToggleSidebar,
  onOpenNote,
}: {
  onToggleSidebar: () => void;
  onOpenNote: () => void;
}) {
  const notes = useWorkspace((state) => state.noteList.notes);
  const status = useWorkspace((state) => state.noteList.status);
  const error = useWorkspace((state) => state.noteList.errorCode);
  const creating = useWorkspace((state) => state.noteList.isCreating);
  const activeId = useWorkspace((state) => state.activeNoteId);
  const select = useWorkspace((state) => state.selectNote);
  const pin = useWorkspace((state) => state.togglePin);
  const query = useWorkspace((state) => state.searchQuery);
  const terms = searchHighlightTerms(query);
  const customize = useWorkspace((state) => state.customizeTemplate);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
    null,
  );
  const create = useWorkspace((state) => state.createNote);
  const navigation = useWorkspace((state) => state.navigation);
  const books = useWorkspace((state) => state.library.notebooks);
  const total = useWorkspace((state) => state.library.matching);
  const hasMore = useWorkspace((state) => state.noteList.hasMore);
  const loadMore = useWorkspace((state) => state.loadMoreNotes);
  const title =
    navigation.type === 'all'
      ? 'Todas las notas'
      : navigation.type === 'templates'
        ? 'Plantillas'
        : navigation.type === 'trash'
          ? 'Papelera'
          : navigation.type === 'notebook'
            ? (books.find((book) => book.id === navigation.id)?.name ??
              'Sin notebook')
            : navigation.type === 'status'
              ? statusLabels[navigation.status]
              : navigation.name;
  const sort = useWorkspace((state) => state.preferences.noteSort);
  const updatePreferences = useWorkspace((state) => state.updatePreferences);
  const refresh = useWorkspace((state) => state.refreshNotes);
  const setSort = (noteSort: 'updated' | 'title') => {
    void updatePreferences({ noteSort });
    void refresh();
  };
  return (
    <section className="pane pane--note-list" aria-labelledby="note-list-title">
      <header className="note-list-header window-drag-region">
        <IconButton
          icon={PanelLeft}
          label="Mostrar u ocultar biblioteca"
          onClick={onToggleSidebar}
        />
        <h1 id="note-list-title" title={title}>
          {title}
        </h1>
        <IconButton
          icon={SquarePen}
          label="Nueva nota"
          disabled={creating}
          onClick={() => {
            void create().then(onOpenNote);
          }}
        />
      </header>
      <div className="note-list-search">
        <NoteSearch />
        <details className="sort-menu">
          <summary title="Ordenar notas" aria-label="Ordenar notas">
            <ListFilter size={17} />
          </summary>
          <div className="popover">
            <button
              type="button"
              onClick={() => setSort('updated')}
              aria-pressed={sort === 'updated'}
            >
              Última modificación
            </button>
            <button
              type="button"
              onClick={() => setSort('title')}
              aria-pressed={sort === 'title'}
            >
              Título
            </button>
          </div>
        </details>
      </div>
      <UiSlot
        name={
          navigation.type === 'trash' ? 'note-list-bar:trash' : 'note-list-bar'
        }
      />
      {status === 'loading' && (
        <p className="list-status" role="status">
          Cargando notas…
        </p>
      )}
      {error && (
        <p className="list-status list-error" role="alert">
          {errorMessage(error)}
        </p>
      )}
      {navigation.type === 'templates' && !query && (
        <details className="builtin-template-library">
          <summary>Plantillas incluidas</summary>
          {builtinTemplates.map((template) => (
            <button
              className="button"
              type="button"
              key={template.id}
              onClick={() => void customize(template)}
            >
              {template.title} · Personalizar
            </button>
          ))}
        </details>
      )}
      <ul
        className="note-items"
        aria-label="Resultados de notas"
        aria-busy={status === 'loading'}
      >
        {notes.map((note) => (
          <NoteListItem
            key={note.id}
            note={note}
            active={note.id === activeId}
            terms={terms}
            onContextMenu={(event) => {
              event.preventDefault();
              event.currentTarget.focus();
              select(note.id);
              setMenu({ id: note.id, x: event.clientX, y: event.clientY });
            }}
            onSelect={(id) => {
              select(id);
              onOpenNote();
            }}
          />
        ))}
        {notes.length === 0 && status !== 'loading' && (
          <li className="empty-list-state">No hay notas en esta vista.</li>
        )}
        {hasMore && (
          <li className="load-more-notes">
            <button
              type="button"
              className="button"
              disabled={status === 'loading'}
              onClick={() => void loadMore()}
            >
              Cargar más notas
            </button>
          </li>
        )}
      </ul>
      <footer className="note-list-footer">
        {total} {total === 1 ? 'nota' : 'notas'}
        {hasMore ? ` · ${notes.length} cargadas` : ''}
      </footer>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          actions={[
            {
              label: notes.find((note) => note.id === menu.id)?.isPinned
                ? 'Desfijar nota'
                : 'Fijar nota',
              disabled: navigation.type === 'trash',
              run: pin,
            },
          ]}
        />
      )}
    </section>
  );
}

function NoteSearch() {
  const navigation = useWorkspace((state) => state.navigation);
  const query = useWorkspace((state) => state.searchQuery);
  const search = useWorkspace((state) => state.setSearchQuery);
  const global = useWorkspace((state) => state.searchGlobal);
  const setGlobal = useWorkspace((state) => state.setSearchGlobal);
  const [input, setInput] = useState(query);
  useEffect(() => setInput(query), [query, navigation]);
  useEffect(() => {
    if (input.trim() === query) return;
    const timer = window.setTimeout(() => {
      void search(input);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [input, query, search]);
  return (
    <form
      className="search-form"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        void search(input);
      }}
    >
      <button
        type="button"
        className="search-scope-toggle"
        aria-label={
          global ? 'Buscar en toda la biblioteca' : 'Filtrar esta vista'
        }
        title={
          global
            ? 'Cambiar a filtro de esta vista'
            : 'Cambiar a búsqueda global'
        }
        aria-pressed={global}
        onClick={() => void setGlobal(!global)}
      >
        {global ? <Search size={16} /> : <Filter size={16} />}
      </button>
      <label className="visually-hidden" htmlFor="note-search">
        Buscar notas
      </label>
      <input
        id="note-search"
        type="search"
        placeholder={global ? 'Buscar en toda la biblioteca' : 'Filtrar notas'}
        maxLength={512}
        title="book:, tag:, status:, title:, body:, frases entre comillas y exclusiones con -"
        aria-invalid={!!query && !parseNoteSearch(query).valid}
        autoComplete="off"
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />
    </form>
  );
}

const relativeTime = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function relativeDate(value: string) {
  const days = Math.round((Date.parse(value) - Date.now()) / 86_400_000);
  if (days === 0) {
    const hours = Math.round((Date.parse(value) - Date.now()) / 3_600_000);
    return hours === 0 ? 'Ahora' : relativeTime.format(hours, 'hour');
  }
  return relativeTime.format(days, 'day');
}

const NoteListItem = memo(function NoteListItem({
  note,
  active,
  onSelect,
  terms,
  onContextMenu,
}: {
  note: NoteProjection;
  active: boolean;
  onSelect: (id: string) => void;
  terms: string[];
  onContextMenu: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const noteStatus = note.metadata?.status ?? 'none';
  const StatusIcon = statusIcons[noteStatus];
  const excerpt = note.body.replaceAll(/\s+/g, ' ').trim();
  const tasks = [...note.body.matchAll(/^\s*[-*+] \[([ xX])\]/gm)];
  const completed = tasks.filter((task) => task[1] !== ' ').length;
  return (
    <li>
      <button
        className="note-list-item"
        type="button"
        data-active={active}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelect(note.id)}
        onContextMenu={onContextMenu}
      >
        <strong className="note-row-title">
          {note.isPinned && (
            <Pin size={14} className="pin-icon" aria-label="Fijada" />
          )}
          {noteStatus !== 'none' && (
            <StatusIcon
              size={14}
              className={`status-${noteStatus}`}
              aria-hidden="true"
            />
          )}
          <HighlightedText
            text={note.title || 'Nota sin título'}
            terms={terms}
          />
        </strong>
        <span className="note-row-metadata">
          <time
            dateTime={note.updatedAt}
            title={new Date(note.updatedAt).toLocaleString()}
          >
            {relativeDate(note.updatedAt)}
          </time>
          {tasks.length > 0 && (
            <span className="task-summary">
              <ClipboardCheck size={12} />
              <progress
                max={tasks.length}
                value={completed}
                aria-label="Progreso de tareas"
              />
              {completed} de {tasks.length}
            </span>
          )}
          {note.metadata?.tags.map((tag) => (
            <TagBadge key={tag} name={tag} />
          ))}
        </span>
        <span className="note-list-item-excerpt">
          <HighlightedText text={excerpt.slice(0, 160)} terms={terms} />
        </span>
      </button>
    </li>
  );
});

function errorMessage(code: AppErrorCode) {
  switch (code) {
    case 'invalid_input':
      return 'La búsqueda no es válida.';
    case 'not_found':
      return 'La nota ya no está disponible.';
    case 'conflict':
      return 'La nota cambió en otra vista. Tus cambios siguen en el borrador.';
    case 'unavailable':
      return 'No se pudo cargar esta vista.';
  }
}
