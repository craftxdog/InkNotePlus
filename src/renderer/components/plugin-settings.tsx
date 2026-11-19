import { useCallback, useEffect, useState } from 'react';
import type { PluginInfo } from '../../shared/plugins';
import { useWorkspace } from '../state/workspace-context';
import { SettingGroup } from './settings-controls';

export function PluginSettings() {
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const api = useWorkspace((state) => state.pluginApi);
  const statuses = useWorkspace((state) => state.pluginStatuses);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(() => {
    void api.plugins.list().then((result) => {
      if (result.ok) setPlugins(result.data);
    });
  }, [api]);
  useEffect(refresh, [refresh]);
  const toggle = (name: string, on: boolean) =>
    void update({
      enabledPlugins: on
        ? [...new Set([...preferences.enabledPlugins, name])]
        : preferences.enabledPlugins.filter((item) => item !== name),
    });
  return (
    <>
      <SettingGroup title="Plugins">
        <p className="settings-description">
          Los plugins se ejecutan aislados, sin Node, sin red y sin acceso a tus
          archivos. Un plugin activado puede leer y modificar tus notas. Los
          plugins de Inkdrop que usan Node, Electron o componentes visuales no
          funcionarán.
        </p>
        {plugins.map(({ name, version, description }) => {
          const on = preferences.enabledPlugins.includes(name);
          return (
            <div className="plugin-row" key={name}>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  aria-label={`Activar ${name}`}
                  checked={on}
                  onChange={(event) => toggle(name, event.target.checked)}
                />
                <span>
                  {name} <small>{version}</small>
                </span>
              </label>
              {description && (
                <p className="settings-description">{description}</p>
              )}
              {on && statuses[name] && <p role="alert">{statuses[name]}</p>}
              <button
                className="button"
                type="button"
                onClick={() => {
                  toggle(name, false);
                  void api.plugins.remove(name).then(refresh);
                }}
              >
                Eliminar
              </button>
            </div>
          );
        })}
        {!plugins.length && (
          <p className="settings-description">No hay plugins instalados.</p>
        )}
        {message && <p role="alert">{message}</p>}
        <div className="settings-inline-actions">
          <button
            className="button"
            type="button"
            onClick={() => {
              setMessage(null);
              void api.plugins.install().then((result) => {
                if (!result.ok) setMessage('No se pudo instalar el plugin.');
                else if (result.data && !result.data.ok)
                  setMessage(result.data.message);
                refresh();
              });
            }}
          >
            Instalar desde una carpeta
          </button>
        </div>
      </SettingGroup>
      <SettingGroup title="Script de inicio">
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={preferences.initScriptEnabled}
            onChange={(event) =>
              void update({ initScriptEnabled: event.target.checked })
            }
          />
          Ejecutar init.js al iniciar InkNote
        </label>
        <p className="settings-description">
          Se ejecuta con las mismas limitaciones que un plugin.
        </p>
        {preferences.initScriptEnabled && statuses.init && (
          <p role="alert">{statuses.init}</p>
        )}
        <div className="settings-inline-actions">
          <button
            className="button"
            type="button"
            onClick={() => void api.plugins.openInit()}
          >
            Abrir init.js
          </button>
        </div>
      </SettingGroup>
    </>
  );
}
