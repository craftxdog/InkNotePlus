import { extensionOriginSchema } from '../../shared/preferences';
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
      <label className="setting-toggle">
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
