import { PanelLeft } from 'lucide-react';
import { useWorkspace } from '../state/workspace-context';
import { IconButton } from './icon-button';

export function NoteTrashActions({ inTrash }: { inTrash: boolean }) {
  const open = useWorkspace((state) => state.openNoteAction);
  return (
    <div className="note-trash-actions">
      {inTrash ? (
        <>
          <button
            className="button button--primary"
            type="button"
            onClick={() => open('restore')}
          >
            Mover a notebook…
          </button>
          <button
            className="button"
            type="button"
            onClick={() => open('delete')}
          >
            Eliminar definitivamente…
          </button>
        </>
      ) : (
        <button className="button" type="button" onClick={() => open('trash')}>
          Mover a papelera
        </button>
      )}
    </div>
  );
}

export function SelectedNotesPanel({
  onShowNotes,
}: {
  onShowNotes: () => void;
}) {
  const count = useWorkspace((state) => state.selectedNoteIds.length);
  const inTrash = useWorkspace((state) => state.navigation.type === 'trash');
  return (
    <main className="editor-layout" aria-label="Notas seleccionadas">
      <header className="editor-topbar window-drag-region">
        <IconButton
          icon={PanelLeft}
          label="Mostrar lista de notas"
          onClick={onShowNotes}
        />
      </header>
      <div className="workspace-empty">
        <h2>{count} notas seleccionadas</h2>
        <NoteTrashActions inTrash={inTrash} />
      </div>
    </main>
  );
}
