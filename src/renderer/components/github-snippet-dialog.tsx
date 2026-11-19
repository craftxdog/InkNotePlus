import { useState } from 'react';
import { EditorView } from '@codemirror/view';
import { useWorkspace } from '../state/workspace-context';
import { Modal } from './modal';

const messages = {
  invalid_url:
    'Usa un enlace a un archivo de GitHub, como …/blob/main/a.ts#L1-L9.',
  not_found: 'No se encontró el archivo. Si es privado, añade un token.',
  unauthorized: 'GitHub rechazó el acceso. Revisa tu token.',
  too_large: 'El fragmento es demasiado grande. Elige un rango de líneas.',
  failed: 'No se pudo contactar con GitHub.',
} as const;

export default function GithubSnippetDialog() {
  const close = useWorkspace((state) => state.setGithubSnippetOpen);
  const fetchSnippet = useWorkspace((state) => state.fetchGithubSnippet);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await fetchSnippet(url);
    setBusy(false);
    if (!result.ok) return setError(messages.failed);
    if (result.data.status !== 'ok')
      return setError(messages[result.data.status]);
    const element = document.querySelector<HTMLElement>('.cm-editor');
    const view = element && EditorView.findFromDOM(element);
    if (!view) return setError('Abre una nota en el editor.');
    view.dispatch(view.state.replaceSelection(result.data.markdown));
    close(false);
    // Closing the dialog moves focus, so the editor takes it back afterwards.
    requestAnimationFrame(() => view.focus());
  };
  return (
    <Modal title="Insertar fragmento de GitHub" onClose={() => close(false)}>
      <form
        className="dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          Enlace al archivo
          <input
            autoFocus
            type="url"
            placeholder="https://github.com/usuario/repo/blob/main/a.ts#L1-L9"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <footer className="dialog-actions">
          <button
            className="button button--primary"
            type="submit"
            disabled={busy || !url.trim()}
          >
            {busy ? 'Descargando…' : 'Insertar'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
