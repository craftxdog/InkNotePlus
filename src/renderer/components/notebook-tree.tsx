import { ChevronDown, ChevronRight, Library } from 'lucide-react';
import { useWorkspace } from '../state/workspace-context';
import { IconButton } from './icon-button';
import type { Notebook } from '../../shared/library';
import { useMemo, useState } from 'react';
import { NotebookIcon, NotebookIconPicker } from './notebook-icon';
import { ContextMenu } from './context-menu';
import {
  filterNotebookTree,
  matchesNotebook,
  notebookTree,
} from '../notebooks/notebook-hierarchy';

export function NotebookBreadcrumbs() {
  const books = useWorkspace((state) => state.library.notebooks);
  const scope = useWorkspace((state) => state.preferences.notebookScopeId);
  const focus = useWorkspace((state) => state.focusNotebook);
  if (!scope) return null;
  const path: Notebook[] = [];
  const seen = new Set<string>();
  let book = books.find((value) => value.id === scope);
  while (book && !seen.has(book.id)) {
    seen.add(book.id);
    path.unshift(book);
    book = books.find((value) => value.id === book!.parentId);
  }
  return (
    <nav className="notebook-breadcrumbs" aria-label="Ruta del notebook">
      <ol>
        <li>
          <IconButton
            icon={Library}
            label="Volver a biblioteca"
            onClick={() => void focus(null)}
          />
        </li>
        {path.map((entry, index) => (
          <li key={entry.id}>
            <ChevronRight size={12} aria-hidden="true" />
            <button
              type="button"
              aria-current={index === path.length - 1 ? 'location' : undefined}
              onClick={() => void focus(entry.id)}
              title={entry.name}
            >
              <NotebookIcon name={entry.icon} size={16} />
              {entry.name}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function NotebookTree({
  parentId,
  onNavigate,
  query = '',
}: {
  parentId: string | null;
  onNavigate: () => void;
  query?: string;
}) {
  const books = useWorkspace((state) => state.library.notebooks);
  const expanded = useWorkspace(
    (state) => state.preferences.expandedNotebookIds,
  );
  const counts = useWorkspace((state) => state.preferences.showNoteCounts);
  const navigation = useWorkspace((state) => state.navigation);
  const select = useWorkspace((state) => state.navigate);
  const toggle = useWorkspace((state) => state.toggleNotebook);
  const focus = useWorkspace((state) => state.focusNotebook);
  const [iconNotebookId, setIconNotebookId] = useState<string | null>(null);
  const create = useWorkspace((state) => state.setNotebookDialogOpen);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const entries = useMemo(
    () => notebookTree(books, parentId),
    [books, parentId],
  );
  const parents = useMemo(
    () => new Set(books.map((book) => book.parentId)),
    [books],
  );
  const searching = !!query.trim();
  const visible = filterNotebookTree(entries, query).filter(
    (entry) =>
      searching || entry.ancestors.every((id) => expanded.includes(id)),
  );
  if (
    searching &&
    !visible.length &&
    !(parentId === null && matchesNotebook('Sin notebook', query))
  )
    return (
      <p className="sidebar-empty-state" role="status">
        No se encontraron notebooks.
      </p>
    );
  return visible.map(({ notebook: book, depth }) => {
    const children = parents.has(book.id);
    const open = expanded.includes(book.id);
    return (
      <div key={book.id}>
        <div
          className="notebook-row"
          data-notebook-depth={depth}
          style={{
            paddingInlineStart: `min(calc(var(--16px) + ${depth} * var(--16px)), 45%)`,
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ id: book.id, x: event.clientX, y: event.clientY });
          }}
          data-active={
            navigation.type === 'notebook' && navigation.id === book.id
          }
        >
          {children && !searching ? (
            <button
              type="button"
              className="notebook-disclosure"
              aria-label={`${open ? 'Contraer' : 'Expandir'} ${book.name}`}
              aria-expanded={open}
              onClick={() => void toggle(book.id)}
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          ) : (
            <span className="notebook-disclosure" aria-hidden="true">
              {children && <ChevronDown size={16} />}
            </span>
          )}
          <button
            type="button"
            className="notebook-icon-action"
            aria-label={`Cambiar icono de ${book.name}`}
            title={`Cambiar icono de ${book.name}`}
            onClick={() => setIconNotebookId(book.id)}
          >
            <NotebookIcon name={book.icon} />
          </button>
          <button
            type="button"
            className="notebook-select"
            aria-current={
              navigation.type === 'notebook' && navigation.id === book.id
                ? 'page'
                : undefined
            }
            onClick={() => {
              void select({ type: 'notebook', id: book.id });
              onNavigate();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void focus(book.id);
                onNavigate();
              }
            }}
          >
            <span className="navigation-label">{book.name}</span>
            {counts && (
              <span className="navigation-count">
                {open || !children ? book.count : book.descendantCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="notebook-detail"
            aria-label={`Detail de ${book.name}`}
            title={`Abrir contexto de ${book.name}`}
            onClick={() => {
              void focus(book.id);
              onNavigate();
            }}
          >
            Detail <ChevronRight size={14} />
          </button>
        </div>
        {iconNotebookId === book.id && (
          <NotebookIconPicker
            id={book.id}
            onClose={() => setIconNotebookId(null)}
          />
        )}
        {menu?.id === book.id && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            actions={[
              {
                label: 'Nuevo subnotebook',
                run: () => create(true, book.id),
              },
              {
                label: 'Detail',
                run: () => {
                  void focus(book.id);
                  onNavigate();
                },
              },
              {
                label: 'Cambiar icono',
                run: () => setIconNotebookId(book.id),
              },
            ]}
          />
        )}
      </div>
    );
  });
}
