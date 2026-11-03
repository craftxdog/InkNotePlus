import { useState } from 'react';
import { useWorkspace } from '../state/workspace-context';
import { Modal } from './modal';

export function NotebookDialog() {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const books = useWorkspace((state) => state.library.notebooks);
  const create = useWorkspace((state) => state.createNotebook);
  const error = useWorkspace((state) => state.noteList.errorCode);
  const setOpen = useWorkspace((state) => state.setNotebookDialogOpen);
  return (
    <Modal title="Nuevo notebook" onClose={() => setOpen(false)}>
      <form
        className="dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setAttempted(true);
          void create(name.trim(), parentId || null).finally(() =>
            setBusy(false),
          );
        }}
      >
        <label>
          Nombre
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Dentro de
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Biblioteca</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name}
              </option>
            ))}
          </select>
        </label>
        <footer className="dialog-actions">
          <button
            type="button"
            className="button"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
          <button
            className="button button--primary"
            disabled={!name.trim() || busy}
          >
            {busy ? 'Creando…' : 'Crear notebook'}
          </button>
        </footer>
        {attempted && error && (
          <p role="alert">
            No se pudo crear el notebook. Revisa el nombre y vuelve a intentar.
          </p>
        )}
      </form>
    </Modal>
  );
}
