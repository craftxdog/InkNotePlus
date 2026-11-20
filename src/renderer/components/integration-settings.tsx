import {
  extensionOriginSchema,
  type LocalApiScope,
} from '../../shared/preferences';
import type { Notebook } from '../../shared/library';
import { useEffect, useState } from 'react';
import type { LocalApiStatus } from '../../shared/local-api';
import { copyText } from '../editor/clipboard';
import { useWorkspace } from '../state/workspace-context';
import { SettingGroup } from './settings-controls';

export const mcpConfiguration = (status: LocalApiStatus) =>
  JSON.stringify(
    {
      mcpServers: {
        inknote: {
          type: 'http',
          url: `http://127.0.0.1:${status.port}/mcp`,
          headers: {
            Authorization: `Basic ${btoa(`${status.username}:${status.password ?? ''}`)}`,
          },
        },
      },
    },
    null,
    2,
  );

const statusText = (status: LocalApiStatus) =>
  status.error === 'port_in_use'
    ? `El puerto ${status.port} ya está en uso. Elige otro.`
    : status.error
      ? 'No se pudo iniciar el servidor local.'
      : status.running
        ? `Activo en http://127.0.0.1:${status.port}`
        : 'Desactivado';

export function IntegrationSettings() {
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const getStatus = useWorkspace((state) => state.getLocalApiStatus);
  const regenerate = useWorkspace((state) => state.regenerateLocalApiPassword);
  const subscribe = useWorkspace((state) => state.onLocalApiChanged);
  const [status, setStatus] = useState<LocalApiStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const [port, setPort] = useState(String(preferences.localApiPort));
  const [origins, setOrigins] = useState(
    preferences.localApiExtensionOrigins.join('\n'),
  );
  const originList = [
    ...new Set(
      origins
        .split('\n')
        .map((line) => line.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),
  ];
  const originsValid =
    originList.length <= 10 &&
    originList.every(
      (origin) => extensionOriginSchema.safeParse(origin).success,
    );
  useEffect(() => {
    let active = true;
    void getStatus().then((result) => {
      if (active && result.ok) setStatus(result.data);
    });
    const stop = subscribe(setStatus);
    return () => {
      active = false;
      stop();
    };
  }, [getStatus, subscribe]);
  const portNumber = Number(port);
  const portValid =
    Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65_535;
  return (
    <SettingGroup title="Servidor local">
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={preferences.localApiEnabled}
          onChange={(event) =>
            void update({ localApiEnabled: event.target.checked })
          }
        />
        Permitir que otras aplicaciones de este equipo accedan a mis notas
      </label>
      <p className="settings-description">
        Las aplicaciones y agentes de IA que tengan la contraseña podrán leer,
        crear y editar notas. Solo acepta conexiones desde este equipo.
      </p>
      <LocalApiScopeField />
      <label>
        Puerto
        <input
          type="number"
          min={1024}
          max={65535}
          aria-invalid={!portValid}
          value={port}
          onChange={(event) => setPort(event.target.value)}
          onBlur={() => {
            if (portValid && portNumber !== preferences.localApiPort)
              void update({ localApiPort: portNumber });
          }}
        />
      </label>
      <label>
        Extensiones autorizadas
        <textarea
          rows={2}
          aria-invalid={!originsValid}
          placeholder="chrome-extension://…"
          value={origins}
          onChange={(event) => setOrigins(event.target.value)}
          onBlur={() => {
            if (originsValid)
              void update({ localApiExtensionOrigins: originList });
          }}
        />
      </label>
      <p className="settings-description">
        Una por línea. Copia el origen que muestran las opciones del Web
        Clipper. Ninguna página web puede usar el servidor.
      </p>
      {status && (
        <p
          className="settings-description"
          role={status.error ? 'alert' : 'status'}
        >
          {statusText(status)}
        </p>
      )}
      {status?.enabled && status.password && (
        <>
          <dl className="local-api-credentials">
            <div>
              <dt>Usuario</dt>
              <dd>{status.username}</dd>
            </div>
            <div>
              <dt>Contraseña</dt>
              <dd>{visible ? status.password : '••••••••••••'}</dd>
            </div>
          </dl>
          {!status.persisted && (
            <p className="settings-description">
              Este sistema no tiene un llavero disponible. La contraseña cambia
              cada vez que abres InkNote.
            </p>
          )}
          <div className="settings-inline-actions">
            <button
              className="button"
              type="button"
              onClick={() => setVisible(!visible)}
            >
              {visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void copyText(status.password ?? '')}
            >
              Copiar contraseña
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void copyText(mcpConfiguration(status))}
            >
              Copiar configuración MCP
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void regenerate()}
            >
              Cambiar contraseña
            </button>
          </div>
        </>
      )}
    </SettingGroup>
  );
}

// Notebooks in tree order, labelled with their path: "Trabajo › Clientes".
function notebookPaths(notebooks: readonly Notebook[]) {
  const children = new Map<string | null, Notebook[]>();
  for (const notebook of notebooks)
    children.set(notebook.parentId, [
      ...(children.get(notebook.parentId) ?? []),
      notebook,
    ]);
  const paths: { id: string; label: string }[] = [];
  const visit = (parentId: string | null, prefix: string) => {
    for (const notebook of children.get(parentId) ?? []) {
      const label = prefix ? `${prefix} › ${notebook.name}` : notebook.name;
      paths.push({ id: notebook.id, label });
      visit(notebook.id, label);
    }
  };
  visit(null, '');
  return paths;
}

function LocalApiScopeField() {
  const scope = useWorkspace((state) => state.preferences.localApiScope);
  const update = useWorkspace((state) => state.updatePreferences);
  const notebooks = useWorkspace((state) => state.library.notebooks);
  const tags = useWorkspace((state) => state.library.tags);
  const paths = notebookPaths(notebooks);
  const set = (localApiScope: LocalApiScope) => void update({ localApiScope });
  return (
    <>
      <label>
        Notas accesibles
        <select
          aria-label="Notas accesibles"
          value={scope.type}
          onChange={(event) => {
            const type = event.target.value;
            if (type === 'notebook' && paths[0])
              set({ type, notebookId: paths[0].id });
            else if (type === 'tag' && tags[0])
              set({ type, tag: tags[0].name });
            else set({ type: 'all' });
          }}
        >
          <option value="all">Todas las notas</option>
          <option value="notebook" disabled={!paths.length}>
            Solo un notebook y sus sub-notebooks
          </option>
          <option value="tag" disabled={!tags.length}>
            Solo las notas con una etiqueta
          </option>
        </select>
      </label>
      {scope.type === 'notebook' && (
        <label>
          Notebook
          <select
            aria-label="Notebook accesible"
            value={scope.notebookId}
            onChange={(event) =>
              set({ type: 'notebook', notebookId: event.target.value })
            }
          >
            {!paths.some((path) => path.id === scope.notebookId) && (
              <option value={scope.notebookId}>Notebook eliminado</option>
            )}
            {paths.map((path) => (
              <option key={path.id} value={path.id}>
                {path.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {scope.type === 'tag' && (
        <label>
          Etiqueta
          <select
            aria-label="Etiqueta accesible"
            value={scope.tag}
            onChange={(event) => set({ type: 'tag', tag: event.target.value })}
          >
            {!tags.some((tag) => tag.name === scope.tag) && (
              <option value={scope.tag}>{scope.tag}</option>
            )}
            {tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="settings-description">
        {scope.type === 'all'
          ? 'Con la contraseña se puede acceder a todas tus notas.'
          : scope.type === 'notebook'
            ? 'Las demás notas no existen para las aplicaciones: no aparecen en búsquedas ni se pueden leer o editar. Las notas nuevas se crean en este notebook.'
            : 'Las demás notas no existen para las aplicaciones: no aparecen en búsquedas ni se pueden leer o editar. Las notas nuevas reciben esta etiqueta, y no se puede quitar.'}
      </p>
    </>
  );
}
