import { Files } from 'lucide-react';
import { useWorkspace } from '../state/workspace-context';
export function ChooseTemplateAction() {
  const draft = useWorkspace((state) => state.document);
  const inTrash = useWorkspace((state) => state.navigation.type === 'trash');
  const choose = useWorkspace((state) => state.setTemplatePickerOpen);
  return draft.noteId &&
    !inTrash &&
    !draft.body.trim() &&
    !draft.metadata.isTemplate ? (
    <div className="empty-note-actions">
      <button className="button" type="button" onClick={() => choose(true)}>
        <Files size={16} />
        Elegir plantilla
      </button>
    </div>
  ) : null;
}
