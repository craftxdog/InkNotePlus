import { ChevronDown, ChevronRight, Library } from 'lucide-react';
import { useWorkspace } from '../state/workspace-context';
import { IconButton } from './icon-button';
import type { Notebook } from '../../shared/library';
import { useMemo, useState, type DragEvent } from 'react';
import { NotebookIcon, NotebookIconPicker } from './notebook-icon';
import { ContextMenu } from './context-menu';
import {
  filterNotebookTree,
  matchesNotebook,
  notebookDropTarget,
  notebookStepTarget,
  notebookTree,
  type NotebookDropZone,
} from '../notebooks/notebook-hierarchy';
import {
  currentLibraryDrag,
  endLibraryDrag,
  startLibraryDrag,
} from '../notebooks/library-drag';

function dropZone(event: DragEvent<HTMLElement>): NotebookDropZone {
  const { top, height } = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - top) / height;
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
}

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
  const openLibraryDialog = useWorkspace((state) => state.setLibraryDialog);
  const moveNotes = useWorkspace((state) => state.moveNotes);
  const reorder = useWorkspace((state) => state.reorderNotebook);
  const importNotes = useWorkspace((state) => state.importNotes);
  const exportNotes = useWorkspace((state) => state.exportNotes);
  const [drop, setDrop] = useState<{
    id: string;
    zone: NotebookDropZone;
  } | null>(null);
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
  // Notes always land inside a notebook; notebooks use the row edges to reorder.
  const resolveDrop = (event: DragEvent<HTMLElement>, id: string) => {
    const drag = currentLibraryDrag();
    if (drag?.kind === 'notes') return { drag, zone: 'inside' as const };
    if (drag?.kind !== 'notebook') return null;
    const zone = dropZone(event);
    const placement = notebookDropTarget(books, drag.id, id, zone);
    return placement && { drag, zone, placement };
  };
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
          data-drop={drop?.id === book.id ? drop.zone : undefined}
          draggable={!searching}
          onDragStart={(event) =>
            startLibraryDrag(event, { kind: 'notebook', id: book.id })
          }
          onDragEnd={() => {
            endLibraryDrag();
            setDrop(null);
          }}
          onDragOver={(event) => {
            const target = resolveDrop(event, book.id);
            if (!target) {
              setDrop(null);
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (drop?.id !== book.id || drop.zone !== target.zone)
              setDrop({ id: book.id, zone: target.zone });
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setDrop(null);
          }}
          onDrop={(event) => {
            const target = resolveDrop(event, book.id);
            setDrop(null);
            if (!target) return;
            event.preventDefault();
            if (target.drag.kind === 'notes')
              void moveNotes(target.drag.ids, book.id);
            else if (target.placement)
              void reorder({ id: target.drag.id, ...target.placement });
          }}
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
              {
                label: 'Renombrar…',
                run: () =>
                  openLibraryDialog({
                    kind: 'rename-notebook',
                    id: book.id,
                    name: book.name,
                  }),
              },
              {
                label: 'Mover a…',
                run: () =>
                  openLibraryDialog({
                    kind: 'move-notebook',
                    id: book.id,
                    name: book.name,
                  }),
              },
              ...(
                [
                  ['Subir', -1],
                  ['Bajar', 1],
                ] as const
              ).flatMap(([label, step]) => {
                const placement = notebookStepTarget(books, book.id, step);
                return placement
                  ? [
                      {
                        label,
                        run: () => void reorder({ id: book.id, ...placement }),
                      },
                    ]
                  : [];
              }),
              ...(['markdown', 'html'] as const).map((format) => ({
                label: `Exportar a ${format === 'html' ? 'HTML' : 'Markdown'}…`,
                run: () =>
                  void exportNotes({
                    format,
                    scope: { kind: 'notebook', id: book.id },
                  }),
              })),
              {
                label: 'Importar archivos aquí…',
                run: () => void importNotes('files', book.id),
              },
              {
                label: 'Importar carpeta aquí…',
                run: () => void importNotes('folder', book.id),
              },
              {
                label: 'Eliminar notebook…',
                run: () =>
                  openLibraryDialog({
                    kind: 'delete-notebook',
                    id: book.id,
                    name: book.name,
                  }),
              },
            ]}
          />
        )}
      </div>
    );
  });
}
