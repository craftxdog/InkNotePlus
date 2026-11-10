import { useEffect, useState } from 'react';
import { ArchiveRestore, FolderOpen } from 'lucide-react';
import type { Result } from '../../shared/ipc';
import type { BackupStatus } from '../../shared/transfer';
import { useWorkspace } from '../state/workspace-context';
import { SettingGroup } from './settings-controls';

export function BackupSettings() {
  const transfer = useWorkspace((state) => state.transfer);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = transfer.onBackupChanged((status) => {
      receivedEvent = true;
      setStatus(status);
    });
    void transfer.backupStatus().then((result) => {
      if (!active || receivedEvent) return;
      if (result.ok) setStatus(result.data);
      else
        setMessage({
          text: 'No se pudo leer la configuración de respaldo.',
          error: true,
        });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [transfer]);

  async function run<T>(
    action: () => Promise<Result<T>>,
    onSuccess: (value: T) => void,
    errorMessage: string,
  ) {
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await action();
      if (result.ok) onSuccess(result.data);
      else
        setMessage({
          text:
            result.error.code === 'conflict'
              ? 'Guarda los cambios pendientes e inténtalo de nuevo.'
              : errorMessage,
          error: true,
        });
    } catch {
      setMessage({ text: errorMessage, error: true });
    } finally {
      setBusy(false);
    }
  }

  const working = busy || status?.state === 'running';
  return (
    <>
      <SettingGroup title="Respaldo automático">
        <label>
          Carpeta de respaldo
          <input
            type="text"
            readOnly
            value={selection ?? status?.directory ?? ''}
            placeholder="Sin configurar"
          />
        </label>
        <p className="settings-description">
          InkNote guarda los cambios en una subcarpeta InkNote Backup con notas,
          notebooks, papelera e imágenes. Elige una ubicación fuera de los datos
          de la app.
        </p>
        <div className="transfer-actions">
          <button
            type="button"
            className="button"
            disabled={working}
            onClick={() =>
              void run(
                transfer.chooseBackupDirectory,
                (directory) => {
                  if (directory) setSelection(directory);
                },
                'No se pudo abrir el selector de carpetas.',
              )
            }
          >
            <FolderOpen size={16} />
            Elegir carpeta…
          </button>
          {selection && (
            <button
              type="button"
              className="button button--primary"
              disabled={working}
              onClick={() =>
                void run(
                  transfer.enableBackup,
                  (status) => {
                    setStatus(status);
                    if (status.state !== 'error') setSelection(null);
                  },
                  'No se pudo escribir el respaldo. Comprueba la carpeta y sus permisos.',
                )
              }
            >
              Aplicar
            </button>
          )}
          {status?.directory && (
            <>
              <button
                type="button"
                className="button"
                disabled={working}
                onClick={() =>
                  void run(
                    transfer.runBackup,
                    setStatus,
                    'No se pudo actualizar el respaldo.',
                  )
                }
              >
                Respaldar ahora
              </button>
              <button
                type="button"
                className="button"
                disabled={working}
                onClick={() =>
                  void run(
                    transfer.disableBackup,
                    (status) => {
                      setStatus(status);
                      setSelection(null);
                    },
                    'No se pudo desactivar el respaldo.',
                  )
                }
              >
                Desactivar
              </button>
            </>
          )}
        </div>
        {status?.state === 'error' && (
          <p role="alert">
            El respaldo automático no pudo escribir en la carpeta configurada.
          </p>
        )}
        <p className="settings-description" role="status">
          {status?.state === 'running'
            ? 'Actualizando respaldo…'
            : status?.lastCompletedAt
              ? `Último respaldo · ${new Date(status.lastCompletedAt).toLocaleString()}`
              : status?.directory
                ? 'Esperando el primer respaldo.'
                : 'Respaldo automático desactivado.'}
        </p>
      </SettingGroup>
      <SettingGroup title="Restaurar biblioteca">
        <p className="settings-description">
          Selecciona una carpeta de respaldo de InkNote. Las notas actuales se
          conservan.
        </p>
        <div className="transfer-actions">
          <button
            type="button"
            className="button"
            disabled={working}
            onClick={() =>
              void run(
                transfer.restoreBackup,
                (summary) => {
                  if (!summary) return;
                  const { notes, notebooks, copies } = summary;
                  setMessage({
                    text: `Restauración completada · ${notes} ${notes === 1 ? 'nota' : 'notas'} · ${notebooks} ${notebooks === 1 ? 'notebook' : 'notebooks'} · ${copies} ${copies === 1 ? 'copia recuperada' : 'copias recuperadas'}`,
                    error: false,
                  });
                },
                'No se pudo restaurar. Comprueba que la carpeta contiene un respaldo completo de InkNote.',
              )
            }
          >
            <ArchiveRestore size={16} />
            Restaurar…
          </button>
        </div>
      </SettingGroup>
      <SettingGroup title="Exportar biblioteca">
        <p className="settings-description">
          Crea archivos Markdown con sus adjuntos y la jerarquía de notebooks.
        </p>
        <div className="transfer-actions">
          <button
            type="button"
            className="button"
            disabled={working}
            onClick={() =>
              void run(
                transfer.exportLibrary,
                (summary) => {
                  if (!summary) return;
                  const { notes, path, missingAttachments } = summary;
                  const exported =
                    notes === 1
                      ? '1 nota exportada'
                      : `${notes} notas exportadas`;
                  const missing = missingAttachments
                    ? ` · Adjuntos sin recuperar (${missingAttachments})`
                    : '';
                  setMessage({
                    text: `${exported} en ${path}${missing}`,
                    error: false,
                  });
                },
                'No se pudo exportar la biblioteca.',
              )
            }
          >
            Exportar todas las notas…
          </button>
        </div>
      </SettingGroup>
      {busy && (
        <p className="settings-description" role="status">
          Procesando…
        </p>
      )}
      {message && (
        <p
          className="transfer-message"
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </>
  );
}
