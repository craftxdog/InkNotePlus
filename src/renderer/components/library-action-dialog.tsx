import { useState } from 'react';
import type { AppErrorCode, Result } from '../../shared/ipc';
import { tagColorSchema, type TagColor } from '../../shared/tags';
import type { LibraryDialogRequest } from '../state/workspace-types';
import { useWorkspace, useWorkspaceStore } from '../state/workspace-context';
import { Modal } from './modal';
import { NotebookPicker } from './notebook-picker';
import { TagBadge, tagColor } from './tag-badge';

const colorLabels: Record<TagColor, string> = {
  default: 'Predeterminado',
  red: 'Rojo',
  orange: 'Naranja',
  yellow: 'Amarillo',
  olive: 'Oliva',
  green: 'Verde',
  teal: 'Turquesa',
  blue: 'Azul',
  violet: 'Violeta',
  purple: 'Morado',
  pink: 'Rosa',
  brown: 'Marrón',
  grey: 'Gris',
  black: 'Negro',
};

export function LibraryActionDialog({
  request,
}: {
  request: LibraryDialogRequest;
}) {
  const store = useWorkspaceStore();
  const notebooks = useWorkspace((state) => state.library.notebooks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [name, setName] = useState(
    request.kind === 'edit-tag' ? request.name : '',
  );
  const [color, setColor] = useState<TagColor>(() => {
    const colors = store.getState().library.tagColors;
    return colors.find((tag) => tag.name === name)?.color ?? tagColor(name);
  });
  const [destination, setDestination] = useState<string | null>(() => {
    if (request.kind !== 'restore') return null;
    const state = store.getState();
    const original =
      request.ids.length === 1
        ? state.noteList.notes.find((note) => note.id === request.ids[0])
            ?.metadata?.notebookId
        : null;
    const preferred = original ?? state.preferences.defaultNotebookId;
    return notebooks.some(({ id }) => id === preferred) ? preferred : null;
  });
  const count = 'ids' in request ? request.ids.length : 0;
  const notes =
    count === 1 ? 'la nota seleccionada' : `las ${count} notas seleccionadas`;
  const state = store.getState();
  const action = describeAction(request, notes);
  const close = () => state.setLibraryDialog(null);

  async function submit() {
    setBusy(true);
    setError(null);
    let result: Result<unknown>;
    switch (request.kind) {
      case 'restore':
        result = await state.manageTrash({
          action: 'restore',
          ids: [...request.ids],
          notebookId: destination,
        });
        break;
      case 'trash':
      case 'delete':
        result = await state.manageTrash({
          action: request.kind,
          ids: [...request.ids],
        });
        break;
      case 'empty':
        result = await state.manageTrash({ action: 'empty' });
        break;
      case 'delete-notebook':
        result = await state.deleteNotebook(request.id);
        break;
      case 'edit-tag':
        result = await state.updateTag({
          name: request.name,
          nextName: name.trim(),
          color,
        });
        break;
      case 'delete-tag':
        result = await state.deleteTag(request.name);
        break;
    }
    if (result.ok) close();
    else {
      setError(result.error.code);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={action.title}
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form
        className="dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void submit();
        }}
      >
        {action.message && <p>{action.message}</p>}
        {request.kind === 'restore' && (
          <NotebookPicker
            notebooks={notebooks}
            value={destination}
            onChange={setDestination}
            disabled={busy}
            label="Notebook de destino"
          />
        )}
        {request.kind === 'edit-tag' && (
          <>
            <label>
              Nombre
              <input
                autoFocus
                type="text"
                value={name}
                maxLength={40}
                required
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Color
              <select
                value={color}
                disabled={busy}
                onChange={(event) =>
                  setColor(tagColorSchema.parse(event.target.value))
                }
              >
                {tagColorSchema.options.map((option) => (
                  <option value={option} key={option}>
                    {colorLabels[option]}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <TagBadge name={name.trim() || request.name} color={color} />
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="list-error">
            {error === 'conflict' && request.kind === 'edit-tag'
              ? 'Ya existe una etiqueta con ese nombre.'
              : error === 'not_found'
                ? 'El elemento ya no está disponible.'
                : 'No se pudo completar la operación. Revisa los cambios pendientes.'}
          </p>
        )}
        <footer className="dialog-actions">
          <button
            className="button"
            type="button"
            onClick={close}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            className={`button ${action.danger ? 'button--danger' : 'button--primary'}`}
            type="submit"
            disabled={busy || (request.kind === 'edit-tag' && !name.trim())}
          >
            {action.confirm}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function describeAction(request: LibraryDialogRequest, notes: string) {
  switch (request.kind) {
    case 'trash':
      return {
        title: 'Mover a papelera',
        confirm: 'Mover a papelera',
        message: `Puedes recuperar ${notes} desde Papelera.`,
        danger: false,
      };
    case 'restore':
      return {
        title: 'Mover a notebook',
        confirm: 'Restaurar',
        message: `Elige dónde restaurar ${notes}.`,
        danger: false,
      };
    case 'delete':
      return {
        title: 'Eliminar definitivamente',
        confirm: 'Eliminar definitivamente',
        message: `Se eliminarán ${notes} y su historial de revisiones.`,
        danger: true,
      };
    case 'empty':
      return {
        title: 'Vaciar papelera',
        confirm: 'Vaciar papelera',
        message:
          'Se eliminarán definitivamente todas las notas de Papelera y sus revisiones.',
        danger: true,
      };
    case 'delete-notebook':
      return {
        title: 'Eliminar notebook',
        confirm: 'Eliminar notebook',
        message: `Se eliminará «${request.name}» con sus subnotebooks. Sus notas pasarán a Papelera.`,
        danger: true,
      };
    case 'edit-tag':
      return {
        title: 'Editar etiqueta',
        confirm: 'Guardar cambios',
        message: null,
        danger: false,
      };
    case 'delete-tag':
      return {
        title: 'Eliminar etiqueta',
        confirm: 'Eliminar etiqueta',
        message: `Se quitará «${request.name}» de todas sus notas.`,
        danger: true,
      };
  }
}
