import {
  ChevronDown,
  FileText,
  Files,
  Settings,
  Search,
  Plus,
  Inbox,
  CirclePlay,
  CirclePause,
  CircleCheck,
  CircleX,
  CircleDashed,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useWorkspace } from '../state/workspace-context';
import type { Navigation } from '../state/workspace-types';
import { IconButton } from './icon-button';
import { tagColor } from './tag-badge';
import { NotebookTree, NotebookBreadcrumbs } from './notebook-tree';
import { UiSlot } from '../extensions/ui-slots';

export const statusLabels = {
  none: 'Sin estado',
  active: 'Activo',
  onhold: 'En espera',
  completed: 'Completado',
  dropped: 'Descartado',
} as const;
export const statusIcons = {
  none: CircleDashed,
  active: CirclePlay,
  onhold: CirclePause,
  completed: CircleCheck,
  dropped: CircleX,
};

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
          actions={
            <IconButton
              icon={Plus}
              label="Nuevo notebook"
              onClick={() => openNotebook(true)}
            />
          }
        >
          {!scope &&
            row(
              'Sin notebook',
              Inbox,
              { type: 'notebook', id: 'unfiled' },
              library.unfiled,
            )}
          <NotebookTree parentId={scope} onNavigate={onNavigate} />
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
              .map((tag) => (
                <button
                  key={tag.name}
                  type="button"
                  className="navigation-item"
                  data-active={isActive({ type: 'tag', name: tag.name })}
                  onClick={() => select({ type: 'tag', name: tag.name })}
                >
                  <span className={`tag-dot tag-color-${tagColor(tag.name)}`} />
                  <span className="navigation-label">{tag.name}</span>
                  {counts && (
                    <span className="navigation-count">{tag.count}</span>
                  )}
                </button>
              ))
          )}
        </SidebarSection>
        {row('Papelera', Trash2, { type: 'trash' }, library.trash)}
      </div>
      <footer className="sidebar-footer">
        <span className="local-status-dot" />
        Almacenamiento local
      </footer>
      <UiSlot name="sidebar" />
    </nav>
  );
}

function SidebarItem({
  label,
  icon: Icon,
  active,
  count,
  onClick,
  className = '',
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  count?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={`navigation-item ${className}`}
      type="button"
      data-active={active}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
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
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="sidebar-section" open>
      <summary>
        <span>{title}</span>
        <span
          className="section-actions"
          onClick={(event) => event.preventDefault()}
        >
          {actions}
        </span>
        <ChevronDown className="section-chevron" size={16} aria-hidden="true" />
      </summary>
      <div>{children}</div>
    </details>
  );
}
