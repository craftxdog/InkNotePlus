import { useEffect, useState } from 'react';
import type {
  SyncDiagnostic,
  SyncErrorStatus,
  SyncStatus,
} from '../../shared/sync';
import { useWorkspace } from '../state/workspace-context';
import { SettingGroup } from './settings-controls';

const errors: Readonly<Record<SyncErrorStatus, string>> = {
  bad_address: 'Usa https://, o http:// solo para un servidor en este equipo.',
  unreachable: 'No se pudo conectar con el servidor.',
  unauthorized: 'El servidor rechazó el usuario o la contraseña.',
  forbidden: 'Tu usuario no tiene permiso sobre esta base de datos.',
  server: 'El servidor devolvió un error.',
  wrong_passphrase:
    'La frase de cifrado no coincide con la de esta base de datos.',
  mass_delete:
    'Se detuvo la sincronización porque faltan muchas notas en este equipo. Desconecta y vuelve a conectar para recuperarlas del servidor.',
  failed: 'La sincronización falló.',
};
const stepLabels = {
  address: 'Dirección',
  proxy: 'Proxy',
  server: 'Servidor',
  login: 'Acceso',
} as const;

export function SyncSettings() {
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const api = useWorkspace((state) => state.syncApi);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [form, setForm] = useState({
    url: '',
    username: '',
    password: '',
    database: 'inknote',
    passphrase: '',
    confirm: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<SyncDiagnostic[]>([]);
  const [proxy, setProxy] = useState(preferences.syncProxy);
  useEffect(() => {
    void api.status().then((result) => {
      if (result.ok) setStatus(result.data);
    });
    return api.onChange(setStatus);
  }, [api]);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const field = (
    key: keyof typeof form,
    label: string,
    type: 'text' | 'url' | 'password' = 'text',
  ) => (
    <label>
      {label}
      <input
        type={type}
        autoComplete="off"
        value={form[key]}
        onChange={(event) => set(key)(event.target.value)}
      />
    </label>
  );
  const proxyValid =
    !proxy.trim() ||
    /^(?:https?|socks5?):\/\/[\w.-]+:\d{1,5}$/.test(proxy.trim());
  const ready =
    !!form.url.trim() &&
    !!form.username.trim() &&
    !!form.password &&
    /^[a-z][a-z0-9_$()+/-]*$/.test(form.database.trim()) &&
    form.passphrase.length >= 8 &&
    form.passphrase === form.confirm;
  const diagnose = async () => {
    setBusy(true);
    const connection = status?.connection;
    const result = await api.diagnose(
      connection
        ? { ...connection, password: '' }
        : {
            url: form.url,
            username: form.username,
            database: form.database,
            password: form.password,
          },
    );
    setBusy(false);
    setSteps(result.ok ? result.data : []);
  };
  const proxySetting = (
    <label>
      Proxy
      <input
        type="text"
        placeholder="Usar la configuración del sistema"
        aria-invalid={!proxyValid}
        value={proxy}
        onChange={(event) => setProxy(event.target.value)}
        onBlur={() => {
          if (proxyValid) void update({ syncProxy: proxy.trim() });
        }}
      />
    </label>
  );
  const diagnosis = steps.length > 0 && (
    <ul className="sync-diagnosis">
      {steps.map(({ step, ok, detail }) => (
        <li key={step} data-ok={ok}>
          <strong>
            {ok ? '✓' : '✕'} {stepLabels[step]}:
          </strong>{' '}
          {detail}
        </li>
      ))}
    </ul>
  );
  if (status?.configured && status.connection)
    return (
      <SettingGroup title="Sincronización con CouchDB">
        <p className="settings-description" role="status">
          {status.state === 'syncing'
            ? 'Sincronizando…'
            : status.error
              ? errors[status.error]
              : status.lastSyncAt
                ? `Última sincronización: ${new Date(status.lastSyncAt).toLocaleString()}`
                : 'Conectado.'}
        </p>
        <p className="settings-description">
          {status.connection.username} · {status.connection.url} ·{' '}
          {status.connection.database}. Tus notas viajan cifradas.
        </p>
        {!!status.lastResult?.conflicts && (
          <p className="settings-description">
            Se guardaron {status.lastResult.conflicts} copias con la etiqueta
            «conflicto» para que no pierdas ninguna versión.
          </p>
        )}
        {!!status.lastResult?.unreadable && (
          <p role="alert">
            {status.lastResult.unreadable} documentos del servidor no se
            pudieron descifrar.
          </p>
        )}
        {!!status.lastResult?.skippedFiles && (
          <p className="settings-description">
            {status.lastResult.skippedFiles} imágenes superan 4 MB y no se
            sincronizan.
          </p>
        )}
        {proxySetting}
        <div className="settings-inline-actions">
          <button
            className="button"
            type="button"
            disabled={status.state === 'syncing'}
            onClick={() => void api.run()}
          >
            Sincronizar ahora
          </button>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => void diagnose()}
          >
            Diagnosticar conexión
          </button>
          <button
            className="button"
            type="button"
            onClick={() => void api.disconnect()}
          >
            Desconectar
          </button>
        </div>
        {diagnosis}
      </SettingGroup>
    );
  return (
    <SettingGroup title="Sincronización con CouchDB">
      <p className="settings-description">
        Conecta tu propio servidor CouchDB. Tus notas se cifran en este equipo
        antes de enviarse.
      </p>
      {field('url', 'Dirección del servidor', 'url')}
      {field('username', 'Usuario')}
      {field('password', 'Contraseña del servidor', 'password')}
      {field('database', 'Base de datos')}
      {field(
        'passphrase',
        'Frase de cifrado (mínimo 8 caracteres)',
        'password',
      )}
      {field('confirm', 'Repite la frase de cifrado', 'password')}
      <p className="settings-description">
        Usa la misma frase en todos tus equipos. Si la pierdes, nadie podrá
        recuperar las notas guardadas en el servidor.
      </p>
      {proxySetting}
      {message && <p role="alert">{message}</p>}
      <div className="settings-inline-actions">
        <button
          className="button button--primary"
          type="button"
          disabled={!ready || busy}
          onClick={() => {
            setBusy(true);
            setMessage(null);
            void api
              .connect({
                url: form.url.trim(),
                username: form.username.trim(),
                password: form.password,
                database: form.database.trim(),
                passphrase: form.passphrase,
              })
              .then((result) => {
                setBusy(false);
                if (!result.ok) setMessage(errors.failed);
                else if (result.data.error)
                  setMessage(errors[result.data.error]);
              });
          }}
        >
          {busy ? 'Conectando…' : 'Conectar'}
        </button>
        <button
          className="button"
          type="button"
          disabled={busy || !form.url.trim()}
          onClick={() => void diagnose()}
        >
          Diagnosticar conexión
        </button>
      </div>
      {diagnosis}
    </SettingGroup>
  );
}
