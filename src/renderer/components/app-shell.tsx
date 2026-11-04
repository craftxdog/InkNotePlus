import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useWorkspace } from '../state/workspace-context';
import { resolveShellLayout } from '../layout/shell-layout';
import { Sidebar } from './sidebar';
import { NoteList } from './note-list';
import { DocumentWorkspace } from './document-workspace';
import { PanelDivider } from './panel-divider';
import { SettingsDialog } from './settings-dialog';
import { NotebookDialog } from './notebook-dialog';

export function AppShell() {
  const layout = useWorkspace((state) => state.mainLayout);
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const setSidebarVisible = useWorkspace((state) => state.setSidebarVisible);
  const settingsOpen = useWorkspace((state) => state.settingsOpen);
  const notebookDialogOpen = useWorkspace((state) => state.notebookDialogOpen);
  const platform = useWorkspace((state) => state.platform);
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1280);
  const [sidebarWidth, setSidebarWidth] = useState(preferences.sidebarWidth);
  const [noteListWidth, setNoteListWidth] = useState(preferences.noteListWidth);
  const [drawer, setDrawer] = useState(false);
  const [compactPane, setCompactPane] = useState<'notes' | 'editor'>('notes');
  useEffect(
    () => setSidebarWidth(preferences.sidebarWidth),
    [preferences.sidebarWidth],
  );
  useEffect(
    () => setNoteListWidth(preferences.noteListWidth),
    [preferences.noteListWidth],
  );
  useEffect(() => {
    if (!root.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const resolved = resolveShellLayout(
    width,
    { ...preferences, sidebarWidth, noteListWidth },
    layout,
  );
  const showSidebar = resolved.sidebar || drawer;
  const showList =
    resolved.list ||
    (resolved.compact &&
      !layout.distractionFreeEnabled &&
      compactPane === 'notes');
  const showEditor =
    !resolved.compact ||
    layout.distractionFreeEnabled ||
    compactPane === 'editor';
  const toggleSidebar = () => {
    if (width < sidebarWidth + noteListWidth + 322) setDrawer(!drawer);
    else setSidebarVisible(!layout.sidebarVisible);
  };
  return (
    <div
      ref={root}
      className="inknote-shell"
      data-layout={resolved.layout}
      data-inknote-canvas="ready"
      data-platform={platform}
      data-sidebar-visible={showSidebar}
      data-sidebar-drawer={drawer && !resolved.sidebar}
      data-list-visible={showList}
      data-editor-visible={showEditor}
      style={
        {
          '--sidebar-width': `${sidebarWidth}px`,
          '--note-list-width': `${noteListWidth}px`,
          '--editor-font-family': preferences.editorFontFamily || undefined,
          '--editor-font-size': `${preferences.editorFontSize}px`,
          '--editor-line-height': preferences.editorLineHeight,
          '--preview-font-family': preferences.previewFontFamily || undefined,
          '--preview-font-size': `${preferences.previewFontSize}px`,
          '--mde-preview-line-height': preferences.previewLineHeight,
        } as CSSProperties
      }
    >
      {drawer && !resolved.sidebar && (
        <button
          className="drawer-backdrop"
          aria-label="Cerrar biblioteca"
          onClick={() => setDrawer(false)}
        />
      )}
      <Sidebar
        drawer={drawer && !resolved.sidebar}
        onClose={() => setDrawer(false)}
        onNavigate={() => {
          setDrawer(false);
          setCompactPane('notes');
        }}
      />
      {resolved.sidebar && (
        <PanelDivider
          label="Anchura de biblioteca"
          width={sidebarWidth}
          min={160}
          max={Math.min(400, width - noteListWidth - 322)}
          onChange={setSidebarWidth}
          onCommit={(value) => {
            void update({ sidebarWidth: value });
          }}
        />
      )}
      <NoteList
        onToggleSidebar={toggleSidebar}
        onOpenNote={() => setCompactPane('editor')}
      />
      {resolved.list && (
        <PanelDivider
          label="Anchura de lista"
          width={noteListWidth}
          min={220}
          max={Math.min(
            480,
            width - (resolved.sidebar ? sidebarWidth : 0) - 322,
          )}
          onChange={setNoteListWidth}
          onCommit={(value) => {
            void update({ noteListWidth: value });
          }}
        />
      )}
      <DocumentWorkspace
        onShowNotes={() => setCompactPane('notes')}
        onToggleSidebar={toggleSidebar}
      />
      <div className="modal-layout">
        {settingsOpen && <SettingsDialog />}
        {notebookDialogOpen && <NotebookDialog />}
      </div>
    </div>
  );
}
