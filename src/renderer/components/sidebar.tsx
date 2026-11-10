import {
  ChevronDown,
  FileText,
  Files,
  Settings,
  Search,
  CirclePlus,
  Inbox,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type MouseEventHandler, type ReactNode } from 'react';
import { useWorkspace } from '../state/workspace-context';
import type { Navigation } from '../state/workspace-types';
import { IconButton } from './icon-button';
import { tagColor, tagColorStyle } from './tag-badge';
import { NotebookTree, NotebookBreadcrumbs } from './notebook-tree';
import { UiSlot } from '../extensions/ui-slots';
import { matchesNotebook } from '../notebooks/notebook-hierarchy';
import { statusLabels, statusIcons } from './note-status';
import { ContextMenu } from './context-menu';

export function Sidebar({
  onNavigate,
  onClose,
  drawer = false,
}: {
  onNavigate: () => void;
  onClose: () => void;
  drawer?: boolean;
}) {
  const library = useWorkspace((state) => state.library);
  const scope = useWorkspace((state) => state.preferences.notebookScopeId);
  const counts = useWorkspace((state) => state.preferences.showNoteCounts);
  const [tagSearch, setTagSearch] = useState<string | null>(null);
  const [notebookSearch, setNotebookSearch] = useState<string | null>(null);
  const [menu, setMenu] = useState<
    | (({ kind: 'tag'; name: string } | { kind: 'trash' }) & {
        x: number;
        y: number;
      })
    | null
  >(null);
  const openLibraryDialog = useWorkspace((state) => state.setLibraryDialog);
  const notebookSearchId = useId();
  const closeNotebookSearch = () => {
    setNotebookSearch(null);
    document.getElementById(`${notebookSearchId}-toggle`)?.focus();
  };
  const navigation = useWorkspace((state) => state.navigation);
  const navigate = useWorkspace((state) => state.navigate);
  const openSettings = useWorkspace((state) => state.setSettingsOpen);
  const openNotebook = useWorkspace((state) => state.setNotebookDialogOpen);
  const select = (value: Navigation) => {
    void navigate(value);
    onNavigate();
  };
  const isActive = (value: Navigation) =>
    JSON.stringify(value) === JSON.stringify(navigation);
  const row = (
    label: string,
    icon: LucideIcon,
    target: Navigation,
    count?: number,
    className?: string,
  ) => (
    <SidebarItem
      key={label}
      label={label}
      icon={icon}
      active={isActive(target)}
      count={counts ? count : undefined}
      className={className}
      onClick={() => select(target)}
    />
  );
  return (
    <nav className="pane pane--sidebar" aria-label="Biblioteca">
      <header className="sidebar-header window-drag-region">
        <span className="app-wordmark">
          <img
            src={
              new URL('../../../assets/icons/64x64.png', import.meta.url).href
            }
            alt=""
            aria-hidden="true"
          />
          InkNote
        </span>
        {drawer && (
          <IconButton icon={X} label="Cerrar biblioteca" onClick={onClose} />
        )}
        <IconButton
          icon={Settings}
          label="Preferencias"
          onClick={() => openSettings(true)}
        />
      </header>
      <NotebookBreadcrumbs />
      <div className="sidebar-scroll">
        <UiSlot name={scope ? 'sidebar-workspace-menu' : 'sidebar-menu'} />
        {row('Todas las notas', FileText, { type: 'all' }, library.total)}
        {row(
          'Plantillas de notas',
          Files,
          { type: 'templates' },
          library.templates,
        )}
        <SidebarSection
          title="Notebooks"
          collapsible={false}
          actions={
            <>
              <IconButton
                id={`${notebookSearchId}-toggle`}
                icon={Search}
                label="Filtrar notebooks"
                active={notebookSearch !== null}
                aria-controls={
                  notebookSearch !== null ? notebookSearchId : undefined
                }
                aria-expanded={notebookSearch !== null}
                onClick={() =>
                  setNotebookSearch(notebookSearch === null ? '' : null)
                }
              />
              <IconButton
                icon={CirclePlus}
                label="Nuevo notebook"
                onClick={() => openNotebook(true)}
              />
            </>
          }
        >
          {notebookSearch !== null && (
            <div className="sidebar-notebook-search">
              <Search size={15} aria-hidden="true" />
              <input
                id={notebookSearchId}
                autoFocus
                aria-label="Buscar notebooks en la biblioteca"
                placeholder="Buscar notebooks…"
                value={notebookSearch}
                onChange={(event) => setNotebookSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    closeNotebookSearch();
                  }
                }}
              />
              <IconButton
                icon={X}
                label="Cerrar búsqueda de notebooks"
                onClick={closeNotebookSearch}
              />
            </div>
          )}
          {!scope &&
            matchesNotebook('Sin notebook', notebookSearch ?? '') &&
            row(
              'Sin notebook',
              Inbox,
              { type: 'notebook', id: 'unfiled' },
              library.unfiled,
              'navigation-item--notebook',
            )}
          <NotebookTree
            parentId={scope}
            onNavigate={onNavigate}
            query={notebookSearch ?? ''}
          />
        </SidebarSection>
        <SidebarSection title="Estado">
          {(['active', 'onhold', 'completed', 'dropped'] as const).map(
            (status) =>
              row(
                statusLabels[status],
                statusIcons[status],
                { type: 'status', status },
                library.statuses[status],
                `status-${status}`,
              ),
          )}
        </SidebarSection>
        <SidebarSection
          title="Etiquetas"
          actions={
            <IconButton
              icon={Search}
              label="Filtrar etiquetas"
              active={tagSearch !== null}
              onClick={() => setTagSearch(tagSearch === null ? '' : null)}
            />
          }
        >
          {tagSearch !== null && (
            <input
              className="sidebar-tag-search"
              aria-label="Buscar etiquetas"
              value={tagSearch}
              onChange={(event) => setTagSearch(event.target.value)}
              placeholder="Buscar etiquetas"
            />
          )}
          {library.tags.length === 0 ? (
            <p className="sidebar-empty-state">Sin etiquetas</p>
          ) : (
            library.tags
              .filter((tag) =>
                tag.name
                  .toLocaleLowerCase()
                  .includes((tagSearch ?? '').toLocaleLowerCase()),
              )
              .map((tag) => {
                const color = tag.color ?? tagColor(tag.name);
                return (
                  <button
                    key={tag.name}
                    type="button"
                    className="navigation-item"
                    data-active={isActive({ type: 'tag', name: tag.name })}
                    onClick={() => select({ type: 'tag', name: tag.name })}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.currentTarget.focus();
                      setMenu({
                        kind: 'tag',
                        name: tag.name,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  >
                    <span
                      className={`tag-dot tag-color-${color}`}
                      style={tagColorStyle(color)}
                    />
                    <span className="navigation-label">{tag.name}</span>
                    {counts && (
                      <span className="navigation-count">{tag.count}</span>
                    )}
                  </button>
                );
              })
          )}
        </SidebarSection>
        <SidebarItem
          label="Papelera"
          icon={Trash2}
          active={navigation.type === 'trash'}
          count={counts ? library.trash : undefined}
          onClick={() => select({ type: 'trash' })}
          onContextMenu={(event) => {
            event.preventDefault();
            event.currentTarget.focus();
            setMenu({ kind: 'trash', x: event.clientX, y: event.clientY });
          }}
        />
      </div>
      <footer className="sidebar-footer">
        <span className="local-status-dot" />
        Almacenamiento local
      </footer>
      <UiSlot name="sidebar" />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          actions={
            menu.kind === 'tag'
              ? [
                  {
                    label: 'Editar etiqueta…',
                    run: () =>
                      openLibraryDialog({ kind: 'edit-tag', name: menu.name }),
                  },
                  {
                    label: 'Eliminar etiqueta…',
                    run: () =>
                      openLibraryDialog({
                        kind: 'delete-tag',
                        name: menu.name,
                      }),
                  },
                ]
              : [
                  {
                    label: 'Vaciar papelera…',
                    disabled: !library.trash,
                    run: () => openLibraryDialog({ kind: 'empty' }),
                  },
                ]
          }
        />
      )}
    </nav>
  );
}

function SidebarItem({
  label,
  icon: Icon,
  active,
  count,
  onClick,
  onContextMenu,
  className = '',
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  count?: number;
  onClick: () => void;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}) {
  return (
    <button
      className={`navigation-item ${className}`}
      type="button"
      data-active={active}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
      <span className="navigation-label">{label}</span>
      {count !== undefined && <span className="navigation-count">{count}</span>}
    </button>
  );
}

function SidebarSection({
  title,
  actions,
  children,
  collapsible = true,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
}) {
  const heading = (
    <>
      <span>{title}</span>
      <span
        className="section-actions"
        onClick={collapsible ? (event) => event.preventDefault() : undefined}
      >
        {actions}
      </span>
      {collapsible && (
        <ChevronDown className="section-chevron" size={16} aria-hidden="true" />
      )}
    </>
  );
  if (!collapsible)
    return (
      <section className="sidebar-section" aria-label={title}>
        <div className="sidebar-section-header">{heading}</div>
        <div>{children}</div>
      </section>
    );
  return (
    <details className="sidebar-section" open>
      <summary className="sidebar-section-header">{heading}</summary>
      <div>{children}</div>
    </details>
  );
}
