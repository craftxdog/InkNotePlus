import { useState, useRef, type KeyboardEvent } from 'react';
import {
  Settings2,
  Type,
  Eye,
  Palette,
  Keyboard,
  Search,
  Check,
  Calculator,
  Workflow,
  Archive,
} from 'lucide-react';
import { useWorkspace } from '../state/workspace-context';
import { ThemeSettings } from './theme-settings';
import { type Preferences, type EditorMode } from '../../shared/preferences';
import { Modal } from './modal';
import { CommitRange } from './commit-range';
import { SettingGroup, FontField, LineHeight } from './settings-controls';
import { Keybindings } from './keybindings-settings';
import { BackupSettings } from './backup-settings';

const sections = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'editing', label: 'Edición', icon: Type },
  { id: 'preview', label: 'Vista previa', icon: Eye },
  { id: 'themes', label: 'Temas', icon: Palette },
  { id: 'keybindings', label: 'Atajos', icon: Keyboard },
  { id: 'backup', label: 'Respaldo', icon: Archive },
] as const;
type Section = (typeof sections)[number]['id'];

export function SettingsDialog() {
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const setOpen = useWorkspace((state) => state.setSettingsOpen);
  const error = useWorkspace((state) => state.preferencesError);
  const books = useWorkspace((state) => state.library.notebooks);
  const refresh = useWorkspace((state) => state.refreshNotes);
  const [section, setSection] = useState<Section>('general');
  const [query, setQuery] = useState('');
  const nav = useRef<HTMLDivElement>(null);
  const choose = (value: Section) => {
    setSection(value);
    setQuery('');
  };
  const tabsKeyDown = (event: KeyboardEvent) => {
    const index = sections.findIndex((value) => value.id === section);
    const next =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? (index + 1) % sections.length
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? (index + sections.length - 1) % sections.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? sections.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    choose(sections[next].id);
    nav.current
      ?.querySelectorAll<HTMLButtonElement>('[role=tab]')
      [next]?.focus();
  };
  const toggle = (
    key: keyof Preferences,
    label: string,
    description?: string,
  ) => (
    <label className="settings-toggle">
      <input
        type="checkbox"
        aria-label={label}
        checked={!!preferences[key]}
        onChange={(event) => void update({ [key]: event.target.checked })}
      />
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
  const range = (
    key:
      | 'sidebarWidth'
      | 'noteListWidth'
      | 'editorFontSize'
      | 'previewFontSize'
      | 'splitRatio',
    label: string,
    min: number,
    max: number,
    unit = 'px',
  ) => (
    <label>
      {label}
      <CommitRange
        label={label}
        min={min}
        max={max}
        unit={unit}
        value={preferences[key]}
        onCommit={(value) => void update({ [key]: value })}
      />
    </label>
  );
  return (
    <Modal
      title="Preferencias"
      className="preferences-dialog"
      onClose={() => setOpen(false)}
    >
      <div className="preferences-body">
        <div
          className="preferences-navigation"
          role="tablist"
          aria-label="Secciones de Preferencias"
          aria-orientation="vertical"
          ref={nav}
          onKeyDown={tabsKeyDown}
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={section === id}
              aria-controls={`settings-panel-${id}`}
              tabIndex={section === id ? 0 : -1}
              onClick={() => choose(id)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <section
          className="preferences-panel"
          role="tabpanel"
          id={`settings-panel-${section}`}
          aria-labelledby={`settings-tab-${section}`}
          tabIndex={0}
        >
          <div className="settings-content">
            <header className="settings-section-header">
              <h3>{sections.find((value) => value.id === section)!.label}</h3>
              <span className="settings-saved">
                <Check size={13} />
                {error ? 'Error al guardar' : 'Guardado automático'}
              </span>
            </header>
            {section === 'general' && (
              <>
                <SettingGroup title="Notas">
                  <label>
                    Notebook predeterminado
                    <select
                      value={preferences.defaultNotebookId ?? ''}
                      onChange={(event) =>
                        void update({
                          defaultNotebookId: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Sin notebook</option>
                      {books.map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="settings-description">
                    Las notas nuevas en Todas las notas se crean aquí. Dentro de
                    un contexto se usa su notebook.
                  </p>
                  <label>
                    Orden de las notas
                    <select
                      value={preferences.noteSort}
                      onChange={(event) => {
                        void update({
                          noteSort: event.target
                            .value as Preferences['noteSort'],
                        });
                        void refresh();
                      }}
                    >
                      <option value="updated">Última modificación</option>
                      <option value="title">Título</option>
                    </select>
                  </label>
                  {toggle(
                    'showNoteCounts',
                    'Mostrar cantidad de notas',
                    'Totales de la biblioteca, notebooks, estados y etiquetas.',
                  )}
                </SettingGroup>
                <SettingGroup title="Paneles">
                  {toggle(
                    'developmentMode',
                    'Modo de desarrollo',
                    'Permite inspeccionar elementos desde el menú contextual. Requiere reiniciar la aplicación.',
                  )}
                  {range('sidebarWidth', 'Anchura de biblioteca', 160, 400)}
                  {range('noteListWidth', 'Anchura de lista', 220, 480)}
                  <label>
                    Vista del editor
                    <select
                      value={preferences.editorMode}
                      onChange={(event) =>
                        void update({
                          editorMode: event.target.value as EditorMode,
                        })
                      }
                    >
                      <option value="edit">Sólo editor</option>
                      <option value="split">Editor y vista previa</option>
                      <option value="preview">Sólo vista previa</option>
                    </select>
                  </label>
                  {range(
                    'splitRatio',
                    'Reparto editor y vista previa',
                    20,
                    80,
                    '%',
                  )}
                </SettingGroup>
              </>
            )}
            {section === 'editing' && (
              <>
                <SettingGroup title="Tipografía">
                  <FontField
                    label="Fuente del editor"
                    setting="editorFontFamily"
                    placeholder="Predeterminada del tema / monoespaciada del sistema"
                  />
                  {range('editorFontSize', 'Tamaño del editor', 10, 40)}
                  <LineHeight
                    setting="editorLineHeight"
                    label="Interlineado del editor"
                  />
                </SettingGroup>
                <SettingGroup title="Comportamiento">
                  {toggle('lineNumbers', 'Mostrar números de línea')}
                  <label>
                    Modo de teclado
                    <select
                      value={preferences.keyboardMode}
                      onChange={(event) =>
                        void update({
                          keyboardMode:
                            event.target.value === 'vim' ? 'vim' : 'standard',
                        })
                      }
                    >
                      <option value="standard">Estándar</option>
                      <option value="vim">Vim</option>
                    </select>
                  </label>
                  <label>
                    Ajuste de líneas (word wrap)
                    <select
                      aria-label="Ajuste de líneas (word wrap)"
                      value={preferences.lineWrapping}
                      onChange={(event) =>
                        void update({
                          lineWrapping: event.target
                            .value as Preferences['lineWrapping'],
                        })
                      }
                    >
                      <option value="off">Desactivado</option>
                      <option value="all">Todas las líneas</option>
                      <option value="prose">Sólo prosa</option>
                      <option value="cursor">
                        Sin ajuste en el bloque del cursor
                      </option>
                    </select>
                  </label>
                  <p className="settings-description">
                    El ajuste es visual: no añade saltos de línea al Markdown.
                    Los bloques de código y tablas pueden desplazarse
                    horizontalmente.
                  </p>
                  {toggle('activeLine', 'Resaltar línea activa')}
                  {toggle('readableLineLength', 'Limitar anchura de lectura')}
                  {toggle('spellcheck', 'Revisión ortográfica del sistema')}
                  {toggle('showToolbar', 'Mostrar barra de formato')}
                  <label>
                    Posición de la barra de formato
                    <select
                      value={preferences.toolbarPlacement}
                      disabled={!preferences.showToolbar}
                      onChange={(event) =>
                        void update({
                          toolbarPlacement:
                            event.target.value === 'fixed'
                              ? 'fixed'
                              : 'floating',
                        })
                      }
                    >
                      <option value="floating">
                        Flotante sobre la selección
                      </option>
                      <option value="fixed">Fija sobre el editor</option>
                    </select>
                  </label>
                </SettingGroup>
              </>
            )}
            {section === 'preview' && (
              <>
                <SettingGroup title="Tipografía">
                  <FontField
                    label="Fuente de la vista previa"
                    setting="previewFontFamily"
                    placeholder="Predeterminada del tema / interfaz del sistema"
                  />
                  {range(
                    'previewFontSize',
                    'Tamaño de la vista previa',
                    10,
                    40,
                  )}
                  <LineHeight
                    setting="previewLineHeight"
                    label="Interlineado de la vista previa"
                  />
                  {toggle(
                    'syncScroll',
                    'Sincronizar desplazamiento',
                    'Editor y vista previa siguen la misma posición del documento.',
                  )}
                </SettingGroup>
                <SettingGroup title="Math" icon={<Calculator size={17} />}>
                  {toggle(
                    'mathEnabled',
                    'Renderizar fórmulas matemáticas',
                    'KaTeX: fórmulas en línea, bloques y código math.',
                  )}
                </SettingGroup>
                <SettingGroup title="Mermaid" icon={<Workflow size={17} />}>
                  {toggle('mermaidEnabled', 'Renderizar diagramas Mermaid')}
                  {toggle(
                    'mermaidPanZoom',
                    'Pan y zoom',
                    'Pellizca el touchpad o usa Ctrl/Cmd + desplazamiento para ampliar. Arrastra para mover.',
                  )}
                  {toggle(
                    'mermaidToolbar',
                    'Mostrar controles del diagrama',
                    'Ampliar, reducir, restablecer y abrir en pantalla completa.',
                  )}
                </SettingGroup>
              </>
            )}
            {section === 'themes' && <ThemeSettings />}
            {section === 'backup' && <BackupSettings />}
            {section === 'keybindings' && (
              <>
                <label className="settings-search">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label="Buscar atajos"
                    placeholder="Buscar comando o atajo"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <p className="settings-description">
                  Mod equivale a Command en macOS y Ctrl en Windows/Linux. Las
                  secuencias se separan con espacios. Un campo vacío desactiva
                  el atajo.
                </p>
                <Keybindings query={query} />
                <button
                  className="button"
                  type="button"
                  onClick={() => void update({ keybindings: [] })}
                >
                  Restablecer atajos personalizados
                </button>
              </>
            )}
            {error && (
              <p role="alert">
                No se pudo guardar la configuración. Los valores anteriores
                siguen disponibles.
              </p>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
