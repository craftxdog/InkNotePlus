import { useWorkspace } from '../state/workspace-context';
import { themeCatalog } from '../themes/catalog';
import type { EditorMode, ThemeId } from '../../shared/preferences';
import { Modal } from './modal';
import { CommitRange } from './commit-range';

export function SettingsDialog() {
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const setOpen = useWorkspace((state) => state.setSettingsOpen);
  const error = useWorkspace((state) => state.preferencesError);
  return (
    <Modal title="Preferencias" onClose={() => setOpen(false)}>
      <div className="settings-content">
        <h3>Apariencia</h3>
        <label>
          Tema
          <select
            aria-label="Tema"
            value={preferences.theme}
            onChange={(event) => {
              void update({ theme: event.target.value as ThemeId });
            }}
          >
            {Object.entries(themeCatalog).map(([id, theme]) => (
              <option value={id} key={id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        <p className="settings-description">
          Un solo tema controla la interfaz, la sintaxis del editor y la vista
          previa.
        </p>
        <label>
          Vista del editor
          <select
            value={preferences.editorMode}
            onChange={(event) => {
              void update({ editorMode: event.target.value as EditorMode });
            }}
          >
            <option value="edit">Sólo editor</option>
            <option value="split">Editor y vista previa</option>
            <option value="preview">Sólo vista previa</option>
          </select>
        </label>
        <h3>Paneles</h3>
        <label>
          Anchura de biblioteca
          <CommitRange
            label="Anchura de biblioteca"
            unit="px"
            min={160}
            max={400}
            value={preferences.sidebarWidth}
            onCommit={(value) => {
              void update({ sidebarWidth: value });
            }}
          />
        </label>
        <label>
          Anchura de lista
          <CommitRange
            label="Anchura de lista"
            unit="px"
            min={220}
            max={480}
            value={preferences.noteListWidth}
            onCommit={(value) => {
              void update({ noteListWidth: value });
            }}
          />
        </label>
        {error && <p role="alert">No se pudo guardar la configuración.</p>}
      </div>
    </Modal>
  );
}
