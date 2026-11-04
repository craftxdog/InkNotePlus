import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  FolderOpen,
  Moon,
  Search,
  Sun,
  Trash2,
} from 'lucide-react';
import { useWorkspace } from '../state/workspace-context';
import { themeCatalog } from '../themes/catalog';
import type { RegistryTheme } from '../../shared/themes';
import { SettingGroup } from './settings-controls';

export function ThemeSettings() {
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const installed = useWorkspace((state) => state.installedThemes);
  const browse = useWorkspace((state) => state.browseThemes);
  const install = useWorkspace((state) => state.installTheme);
  const remove = useWorkspace((state) => state.removeTheme);
  const openLink = useWorkspace((state) => state.openExternalLink);
  const error = useWorkspace((state) => state.themeError);
  const packages = [
    ...new Map(
      [...Object.values(themeCatalog), ...installed].map((theme) => [
        theme.manifest.name,
        theme,
      ]),
    ).values(),
  ];
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'majority' | 'recency' | 'newness'>(
    'majority',
  );
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<RegistryTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!catalogOpen) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void browse({ query, page, sort })
        .then((result) => {
          if (!active) return;
          setResults(result.ok ? result.data : []);
          setFailed(!result.ok);
          setLoading(false);
        })
        .catch(() => {
          if (active) {
            setFailed(true);
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [browse, catalogOpen, query, page, sort, attempt]);
  const run = (name?: string) => {
    setBusy(name ?? 'import');
    void install(name).finally(() => setBusy(null));
  };
  return (
    <>
      <SettingGroup title="Tema de la aplicación">
        <label>
          Tema
          <select
            aria-label="Tema"
            value={preferences.theme}
            onChange={(event) => void update({ theme: event.target.value })}
          >
            {packages.map((theme) => (
              <option key={theme.manifest.name} value={theme.manifest.name}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        <p className="settings-description">
          Un paquete controla interfaz, editor, vista previa y diagramas
          mediante variables CSS.
        </p>
        <div className="theme-options">
          {packages.map((theme) => {
            const active = preferences.theme === theme.manifest.name;
            const Icon = theme.manifest.themeAppearance === 'dark' ? Moon : Sun;
            return (
              <div className="theme-card" key={theme.manifest.name}>
                <button
                  type="button"
                  className="theme-option"
                  aria-pressed={active}
                  onClick={() => void update({ theme: theme.manifest.name })}
                >
                  <Icon size={20} />
                  <span>
                    {theme.label}
                    <small>{theme.manifest.version}</small>
                  </span>
                  {active && <Check size={16} />}
                </button>
                {theme.source === 'installed' && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Eliminar ${theme.label}`}
                    title={
                      active
                        ? 'Activa otro tema antes de eliminarlo'
                        : `Eliminar ${theme.label}`
                    }
                    disabled={active || !!busy}
                    onClick={() => {
                      setBusy(theme.manifest.name);
                      void remove(theme.manifest.name).finally(() =>
                        setBusy(null),
                      );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {error && <p role="alert">{themeErrorMessage(error)}</p>}
        <div className="settings-inline-actions">
          <button
            type="button"
            className="button"
            disabled={!!busy}
            onClick={() => run()}
          >
            <FolderOpen size={16} />
            Importar carpeta de tema
          </button>
          <button
            type="button"
            className="button"
            aria-expanded={catalogOpen}
            onClick={() => setCatalogOpen(!catalogOpen)}
          >
            <Download size={16} />
            Explorar catálogo
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              void openLink('https://my.inkdrop.app/plugins/theme')
            }
          >
            <ExternalLink size={16} />
            Ver en Inkdrop
          </button>
        </div>
        <p className="settings-description">
          Se admiten paquetes unificados de Inkdrop 6. Los temas se instalan sin
          ejecutar scripts.
        </p>
      </SettingGroup>
      {catalogOpen && (
        <SettingGroup title="Catálogo de Inkdrop">
          <label className="settings-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Buscar temas"
              placeholder="Buscar temas"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            Orden
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as typeof sort);
                setPage(0);
              }}
            >
              <option value="majority">Populares</option>
              <option value="recency">Actualizados</option>
              <option value="newness">Nuevos</option>
            </select>
          </label>
          {loading && <p role="status">Consultando catálogo…</p>}
          {failed && (
            <div role="alert">
              <p>No se pudo consultar el catálogo de Inkdrop.</p>
              <button
                type="button"
                className="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Reintentar
              </button>
            </div>
          )}
          {!loading && !failed && !results.length && (
            <p>No hay temas para esta búsqueda.</p>
          )}
          <ul className="theme-registry-results">
            {results.map((theme) => {
              const available = packages.some(
                (item) => item.manifest.name === theme.name,
              );
              return (
                <li key={theme.name}>
                  <div>
                    <strong>{theme.name}</strong>
                    <p>{theme.description}</p>
                    <small>
                      {theme.version} · {theme.downloads.toLocaleString()}{' '}
                      descargas
                    </small>
                  </div>
                  <button
                    type="button"
                    className="button"
                    disabled={available || !theme.compatible || !!busy}
                    onClick={() => run(theme.name)}
                  >
                    {available
                      ? 'Instalado'
                      : !theme.compatible
                        ? 'Incompatible'
                        : busy === theme.name
                          ? 'Instalando…'
                          : 'Instalar'}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="settings-inline-actions">
            <button
              type="button"
              className="button"
              disabled={!page || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              type="button"
              className="button"
              disabled={loading || failed || !results.length || !!query.trim()}
              onClick={() => setPage((value) => value + 1)}
            >
              Siguiente
            </button>
          </div>
        </SettingGroup>
      )}
      <CustomStyles />
    </>
  );
}

function CustomStyles() {
  const css = useWorkspace((state) => state.customStyles);
  const save = useWorkspace((state) => state.saveCustomStyles);
  const draft = useWorkspace((state) => state.customStylesDraft);
  const edit = useWorkspace((state) => state.editCustomStyles);
  const error = useWorkspace((state) => state.themeError);
  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => {
      void save(draft);
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, save]);
  return (
    <SettingGroup title="Ajustes de estilo">
      <p className="settings-description">
        styles.css se aplica después del tema. Se guarda automáticamente y se
        recarga al editar el archivo.
      </p>
      <label>
        CSS personalizado
        <textarea
          className="custom-styles-input"
          aria-label="CSS personalizado"
          spellCheck={false}
          maxLength={100_000}
          value={draft ?? css}
          onChange={(event) => edit(event.target.value)}
          onBlur={() => {
            if (draft !== null) void save(draft);
          }}
        />
      </label>
      {draft !== null && error && (
        <p role="alert">
          No se pudo guardar el CSS. Revisa la sintaxis; usa recursos locales y
          evita @import.
        </p>
      )}
    </SettingGroup>
  );
}

function themeErrorMessage(code: string) {
  return code === 'incompatible'
    ? 'Este paquete usa el formato antiguo de temas. Se requiere un tema unificado de Inkdrop 6.'
    : code === 'invalid_package'
      ? 'El paquete no contiene un tema CSS válido o usa recursos no admitidos.'
      : code === 'load_failed'
        ? 'No se pudo cargar el tema completo. El tema anterior sigue aplicado.'
        : 'No se pudo completar la operación. Reintenta o importa una carpeta local.';
}
