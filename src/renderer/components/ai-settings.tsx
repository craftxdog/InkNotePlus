import { useEffect, useState } from 'react';
import {
  defaultAiModels,
  type AiProvider,
  type AiStatus,
} from '../../shared/ai';
import { useWorkspace } from '../state/workspace-context';
import { SettingGroup } from './settings-controls';

const providers: readonly (readonly [AiProvider, string])[] = [
  ['anthropic', 'Anthropic (Claude)'],
  ['openai', 'Compatible con OpenAI'],
  ['ollama', 'Ollama (en este equipo)'],
];

export function AiSettings() {
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const getStatus = useWorkspace((state) => state.getAiStatus);
  const saveKey = useWorkspace((state) => state.setAiKey);
  const clearKey = useWorkspace((state) => state.clearAiKey);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(preferences.aiModel);
  const [address, setAddress] = useState(preferences.aiBaseUrl);
  useEffect(() => {
    void getStatus().then((result) => {
      if (result.ok) setStatus(result.data);
    });
  }, [getStatus]);
  const provider = preferences.aiProvider;
  return (
    <SettingGroup title="Asistente de IA">
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={preferences.aiEnabled}
          onChange={(event) => void update({ aiEnabled: event.target.checked })}
        />
        Activar el asistente de IA
      </label>
      <p className="settings-description">
        El texto que elijas se envía a este proveedor, y su uso puede tener
        coste. Con Ollama, el texto no sale de tu equipo.
      </p>
      {preferences.aiEnabled && (
        <>
          <label>
            Proveedor
            <select
              value={provider}
              onChange={(event) => {
                const next = event.target.value as AiProvider;
                setModel(defaultAiModels[next]);
                setAddress('');
                void update({
                  aiProvider: next,
                  aiModel: defaultAiModels[next],
                  aiBaseUrl: '',
                });
              }}
            >
              {providers.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modelo
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              onBlur={() => void update({ aiModel: model.trim() })}
            />
          </label>
          {provider !== 'anthropic' && (
            <label>
              Dirección del servidor
              <input
                type="url"
                placeholder={
                  provider === 'ollama'
                    ? 'http://127.0.0.1:11434'
                    : 'https://api.openai.com/v1'
                }
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                onBlur={() => void update({ aiBaseUrl: address.trim() })}
              />
            </label>
          )}
          {provider !== 'ollama' && (
            <>
              <label>
                Clave de API
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={status?.hasKey ? 'Clave guardada' : ''}
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                />
              </label>
              {status && !status.persisted && (
                <p className="settings-description">
                  Este sistema no tiene un llavero disponible. La clave se
                  olvida al cerrar InkNote.
                </p>
              )}
              <div className="settings-inline-actions">
                <button
                  className="button"
                  type="button"
                  disabled={!key.trim()}
                  onClick={() => {
                    void saveKey(key.trim()).then((result) => {
                      if (result.ok) setStatus(result.data);
                      setKey('');
                    });
                  }}
                >
                  Guardar clave
                </button>
                {status?.hasKey && (
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      void clearKey().then((result) => {
                        if (result.ok) setStatus(result.data);
                      });
                    }}
                  >
                    Eliminar clave
                  </button>
                )}
              </div>
            </>
          )}
          <label>
            Sugerencias al escribir
            <select
              value={preferences.aiSuggestMode}
              onChange={(event) =>
                void update({
                  aiSuggestMode: event.target.value as 'manual' | 'auto',
                })
              }
            >
              <option value="manual">Solo cuando las pida</option>
              <option value="auto">Automáticas al hacer una pausa</option>
            </select>
          </label>
          <p className="settings-description">
            En modo automático, el texto cercano al cursor se envía cada vez que
            haces una pausa al escribir.
          </p>
        </>
      )}
    </SettingGroup>
  );
}

export function GithubSettings() {
  const getStatus = useWorkspace((state) => state.getGithubTokenStatus);
  const save = useWorkspace((state) => state.setGithubToken);
  const clear = useWorkspace((state) => state.clearGithubToken);
  const [hasToken, setHasToken] = useState(false);
  const [token, setToken] = useState('');
  useEffect(() => {
    void getStatus().then((result) => {
      if (result.ok) setHasToken(result.data);
    });
  }, [getStatus]);
  return (
    <SettingGroup title="Fragmentos de GitHub">
      <label>
        Token para repositorios privados
        <input
          type="password"
          autoComplete="off"
          placeholder={hasToken ? 'Token guardado' : 'Opcional'}
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <div className="settings-inline-actions">
        <button
          className="button"
          type="button"
          disabled={!token.trim()}
          onClick={() => {
            void save(token.trim()).then((result) => {
              if (result.ok) setHasToken(true);
              setToken('');
            });
          }}
        >
          Guardar token
        </button>
        {hasToken && (
          <button
            className="button"
            type="button"
            onClick={() => {
              void clear().then((result) => {
                if (result.ok) setHasToken(false);
              });
            }}
          >
            Eliminar token
          </button>
        )}
      </div>
    </SettingGroup>
  );
}
