import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { EditorView } from '@codemirror/view';
import {
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  PanelLeft,
  Pencil,
  Columns2,
  Eye,
  MoreVertical,
  Save,
  Bold,
  Italic,
  Strikethrough,
  Heading,
  Quote,
  Code2,
  List,
  ListOrdered,
  Link,
  Minus,
  BookOpen,
  Pin,
  Trash2,
  RotateCcw,
  Files,
  ImagePlus,
  Highlighter,
  ListChecks,
  FileCode,
  FileText,
  FileDown,
  Printer,
} from 'lucide-react';
import { imageAtCursor, resizeCurrentImage } from '../editor/image-dimensions';
import {
  insertManagedImages,
  type ImageImportError,
} from '../editor/image-insertion';
import { useWorkspace, useWorkspaceStore } from '../state/workspace-context';
import { MarkdownEditor } from '../editor/markdown-editor';
import { MarkdownPreview } from '../editor/markdown-preview';
import { editorCommands } from '../editor/editor-commands';
import { tableAtCursor, tableCommands } from '../editor/table-editor';
import { TableToolbar } from './table-toolbar';
import { resolveShortcutCommand } from '../../shared/keybindings';
import { executeShortcut } from '../shortcuts';
import { noteLinkCompletion } from '../editor/note-link-completion';
import { IconButton } from './icon-button';
import { TagBadge } from './tag-badge';
import { StatusPicker } from './status-picker';
import { CommitRange } from './commit-range';
import { createScrollSync } from '../editor/scroll-sync';
import { NotebookPicker } from './notebook-picker';
import { UiSlot } from '../extensions/ui-slots';
import { NoteTrashActions } from './note-trash-actions';
import type { ExportNoteInput } from '../../shared/transfer';

const exportActions = [
  { format: 'markdown', label: 'Exportar Markdown…', icon: FileText },
  { format: 'html', label: 'Exportar HTML…', icon: FileCode },
  { format: 'pdf', label: 'Exportar PDF…', icon: FileDown },
  { format: 'print', label: 'Imprimir…', icon: Printer },
] as const;

export function DocumentWorkspace({
  onShowNotes,
  onToggleSidebar,
}: {
  onShowNotes: () => void;
  onToggleSidebar: () => void;
}) {
  const store = useWorkspaceStore();
  const noteLinks = useMemo(
    () => noteLinkCompletion(store.getState()),
    [store],
  );
  const draft = useWorkspace((state) => state.document);
  const nonce = useWorkspace((state) => state.styleNonce);
  const preferences = useWorkspace((state) => state.preferences);
  const updatePreferences = useWorkspace((state) => state.updatePreferences);
  const notes = useWorkspace((state) => state.noteList.notes);
  const isSaving = useWorkspace((state) => state.noteList.isSaving);
  const updateDraft = useWorkspace((state) => state.updateDraft);
  const save = useWorkspace((state) => state.saveDraft);
  const select = useWorkspace((state) => state.selectNote);
  const distraction = useWorkspace(
    (state) => state.mainLayout.distractionFreeEnabled,
  );
  const setDistraction = useWorkspace(
    (state) => state.setDistractionFreeEnabled,
  );
  const navigation = useWorkspace((state) => state.navigation);
  const openNoteAction = useWorkspace((state) => state.openNoteAction);
  const importImage = useWorkspace((state) => state.importImage);
  const exportNote = useWorkspace((state) => state.transfer.exportNote);
  const view = useRef<EditorView | null>(null);
  const preview = useRef<HTMLElement>(null);
  const sync = useRef<ReturnType<typeof createScrollSync> | null>(null);
  const currentBody = useRef(draft.body);
  currentBody.current = draft.body;
  const renderedBody = useRef<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(preferences.splitRatio);
  const [imageSelected, setImageSelected] = useState(false);
  const [tableSelected, setTableSelected] = useState(false);
  const [floatingToolbar, setFloatingToolbar] = useState<HTMLElement | null>(
    null,
  );
  const [imageError, setImageError] = useState<ImageImportError>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    text: string;
    error: boolean;
  }>();
  async function runExport(format: ExportNoteInput['format']) {
    if (!draft.noteId || exporting) return;
    setExporting(true);
    setExportMessage(undefined);
    try {
      const result = await exportNote({ id: draft.noteId, format });
      if (!result.ok)
        setExportMessage({
          text:
            result.error.code === 'conflict'
              ? 'Guarda los cambios pendientes e inténtalo de nuevo.'
              : 'No se pudo exportar la nota.',
          error: true,
        });
      else if (result.data) {
        const { path, missingAttachments } = result.data;
        const exported = path
          ? `Nota exportada en ${path}`
          : 'Nota enviada a impresión';
        const missing = missingAttachments
          ? ` · Adjuntos sin recuperar (${missingAttachments})`
          : '';
        setExportMessage({ text: exported + missing, error: false });
      }
    } catch {
      setExportMessage({ text: 'No se pudo exportar la nota.', error: true });
    } finally {
      setExporting(false);
    }
  }
  const insertImage = async (files?: File[]) => {
    const editor = view.current;
    if (!editor) return;
    setImageError(null);
    const result = await insertManagedImages(
      editor,
      importImage,
      () => view.current === editor,
      files,
    );
    if (view.current === editor) {
      setImageError(result);
      editor.focus();
    }
  };
  useEffect(
    () => setSplitRatio(preferences.splitRatio),
    [preferences.splitRatio],
  );
  const index = notes.findIndex((note) => note.id === draft.noteId);
  const current = notes[index];
  const inTrash = navigation.type === 'trash';
  const mode = preferences.editorMode;
  useLayoutEffect(() => {
    if (floatingToolbar) view.current?.requestMeasure();
  }, [floatingToolbar]);
  const renderFormatting = (floating: boolean) =>
    formatButtons.map(({ command, icon, label }) => (
      <IconButton
        key={command}
        icon={icon}
        label={label}
        tabIndex={floating ? -1 : undefined}
        disabled={inTrash || mode === 'preview' || !nonce}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (view.current) editorCommands[command](view.current);
        }}
      />
    ));
  const previewRendered = useCallback(
    (body: string) => {
      renderedBody.current = body;
      sync.current?.refresh(mode === 'split' && preferences.syncScroll);
    },
    [mode, preferences.syncScroll],
  );
  useEffect(() => {
    sync.current?.refresh(mode === 'split' && preferences.syncScroll);
  }, [draft.body, mode, splitRatio, preferences]);
  useEffect(() => {
    view.current?.requestMeasure();
  }, [mode, splitRatio]);
  const setMetadata = (patch: Partial<typeof draft.metadata>) => {
    updateDraft({ metadata: { ...draft.metadata, ...patch } });
  };
  return (
    <main
      className="editor-layout"
      aria-label="Editor"
      data-editor-mode={mode}
      data-readable-width={preferences.readableLineLength}
      style={{ '--editor-ratio': `${splitRatio}%` } as CSSProperties}
    >
      <header className="editor-topbar window-drag-region">
        <div className="editor-navigation">
          <IconButton
            icon={PanelLeft}
            label="Mostrar lista de notas"
            onClick={() => {
              onShowNotes();
              if (distraction) setDistraction(false);
            }}
          />
          <IconButton
            icon={distraction ? Minimize2 : Maximize2}
            label={
              distraction ? 'Salir de modo concentración' : 'Modo concentración'
            }
            active={distraction}
            onClick={() => setDistraction(!distraction)}
          />
          <IconButton
            icon={ArrowLeft}
            label="Nota anterior"
            disabled={index <= 0}
            onClick={() => select(notes[index - 1].id)}
          />
          <IconButton
            icon={ArrowRight}
            label="Nota siguiente"
            disabled={index < 0 || index >= notes.length - 1}
            onClick={() => select(notes[index + 1].id)}
          />
        </div>
        <div
          className="editor-mode-switch"
          role="group"
          aria-label="Modo del editor"
        >
          <IconButton
            icon={Pencil}
            label="Sólo editor"
            active={mode === 'edit'}
            onClick={() => {
              void updatePreferences({ editorMode: 'edit' });
            }}
          />
          <IconButton
            icon={Columns2}
            label="Editor y vista previa"
            active={mode === 'split'}
            onClick={() => {
              void updatePreferences({ editorMode: 'split' });
            }}
          />
          <IconButton
            icon={Eye}
            label="Sólo vista previa"
            active={mode === 'preview'}
            onClick={() => {
              void updatePreferences({ editorMode: 'preview' });
            }}
          />
        </div>
        <div className="editor-actions">
          <span className="save-status" role="status">
            {isSaving
              ? 'Guardando…'
              : draft.isDirty
                ? 'Autoguardado pendiente'
                : ''}
          </span>
          <IconButton
            icon={Save}
            label="Guardar"
            disabled={!draft.isDirty || isSaving || inTrash}
            onClick={() => {
              void save();
            }}
          />
          <details className="editor-more">
            <summary aria-label="Más acciones" title="Más acciones">
              <MoreVertical size={20} />
            </summary>
            <div className="popover">
              <UiSlot name="editor-drawer-menu" />
              <button
                type="button"
                disabled={!draft.noteId || inTrash}
                onClick={() => {
                  updateDraft({ isPinned: !draft.isPinned });
                  void save();
                }}
              >
                <Pin size={16} />
                {draft.isPinned ? 'Desfijar nota' : 'Fijar nota'}
              </button>
              <button
                type="button"
                disabled={!draft.noteId || inTrash}
                onClick={() => {
                  setMetadata({ isTemplate: !draft.metadata.isTemplate });
                  void save();
                }}
              >
                <Files size={16} />
                {draft.metadata.isTemplate
                  ? 'Quitar de plantillas'
                  : 'Usar como plantilla'}
              </button>
              {inTrash ? (
                <>
                  <button
                    type="button"
                    disabled={!draft.noteId}
                    onClick={() => openNoteAction('restore')}
                  >
                    <RotateCcw size={16} />
                    Mover a notebook…
                  </button>
                  <button
                    type="button"
                    disabled={!draft.noteId}
                    onClick={() => openNoteAction('delete')}
                  >
                    <Trash2 size={16} />
                    Eliminar definitivamente…
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!draft.noteId}
                  onClick={() => openNoteAction('trash')}
                >
                  <Trash2 size={16} />
                  Mover a papelera
                </button>
              )}
              {exportActions.map(({ format, label, icon: Icon }) => (
                <button
                  key={format}
                  type="button"
                  disabled={!draft.noteId || exporting}
                  onClick={(event) => {
                    const menu = event.currentTarget.closest('details');
                    menu?.querySelector('summary')?.focus();
                    if (menu) menu.open = false;
                    void runExport(format);
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
              {current && (
                <div className="note-info">
                  Creada: {new Date(current.createdAt).toLocaleString()}
                  <br />
                  Modificada: {new Date(current.updatedAt).toLocaleString()}
                </div>
              )}
            </div>
          </details>
        </div>
      </header>
      {draft.noteId ? (
        <>
          <input
            className="document-title-input"
            type="text"
            aria-label="Título de la nota"
            placeholder="Nota sin título"
            disabled={inTrash}
            value={draft.title}
            onChange={(event) => updateDraft({ title: event.target.value })}
            onKeyDown={(event) => {
              if (
                event.key === 'ArrowDown' &&
                event.currentTarget.selectionEnd === draft.title.length
              ) {
                event.preventDefault();
                executeShortcut(
                  store,
                  'editor:focus-and-go-doc-start',
                  event.currentTarget,
                );
                return;
              }
              if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === 's'
              ) {
                event.preventDefault();
                void save();
              }
            }}
          />
          <EditorMetadata disabled={inTrash} />
          {inTrash && <NoteTrashActions inTrash />}
          <UiSlot name="editor-header" />
          <UiSlot name="editor-meta" />
          <div
            className="editor-toolbar"
            hidden={!preferences.showToolbar}
            role="toolbar"
            aria-label="Formato Markdown"
          >
            {tableSelected && mode !== 'preview' ? (
              <TableToolbar
                run={(command) => {
                  const editor = view.current;
                  if (editor && tableCommands[command](editor)) editor.focus();
                }}
              />
            ) : preferences.toolbarPlacement === 'fixed' ? (
              renderFormatting(false)
            ) : null}
            <IconButton
              icon={ImagePlus}
              label="Insertar imagen"
              disabled={inTrash || mode === 'preview' || !nonce}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (view.current)
                  editorCommands['core:insert-image'](view.current);
              }}
            />
            {imageSelected && (
              <label className="image-size-control">
                Tamaño de imagen
                <select
                  aria-label="Tamaño de imagen"
                  value=""
                  onChange={(event) => {
                    if (view.current)
                      resizeCurrentImage(
                        view.current,
                        event.target.value as '' | '30%' | '50%' | '100%',
                      );
                  }}
                >
                  <option value="" disabled>
                    Elegir tamaño
                  </option>
                  <option value="auto">Automático</option>
                  <option value="30%">Pequeña · 30%</option>
                  <option value="50%">Mitad · 50%</option>
                  <option value="100%">Completa · 100%</option>
                </select>
              </label>
            )}
            <span className="toolbar-spacer" />
            <UiSlot name="editor-toolbar" />
            <label
              className="split-ratio-control"
              title="Reparto editor y preview"
            >
              <Columns2 size={14} />
              <CommitRange
                label="Reparto editor y vista previa"
                min={20}
                max={80}
                value={preferences.splitRatio}
                onPreview={setSplitRatio}
                onCommit={(value) => {
                  void updatePreferences({
                    splitRatio: value,
                  });
                }}
              />
            </label>
          </div>
          {imageError && (
            <div className="image-error" role="alert">
              {imageError === 'changed'
                ? 'El texto seleccionado cambió durante la importación. Vuelve a insertar la imagen.'
                : 'No se pudo importar la imagen. Usa PNG, JPEG, GIF o WebP de hasta 5 MB y 16 megapíxeles.'}
            </div>
          )}
          {(exporting || exportMessage) && (
            <div
              className={
                exportMessage?.error
                  ? 'image-error'
                  : 'transfer-message editor-export-status'
              }
              role={exportMessage?.error ? 'alert' : 'status'}
            >
              {exporting ? 'Preparando nota…' : exportMessage?.text}
            </div>
          )}
          <div className="editor-body">
            <UiSlot name="mde" />
            <section className="pane pane--editor" aria-label="Edición de nota">
              {nonce && !inTrash ? (
                <MarkdownEditor
                  key={draft.noteId}
                  value={draft.body}
                  nonce={nonce}
                  preferences={preferences}
                  onChange={(body) => updateDraft({ body })}
                  onImageFiles={(files) => void insertImage(files)}
                  onInsertImage={() => void insertImage()}
                  onFloatingToolbar={setFloatingToolbar}
                  noteLinks={noteLinks}
                  onVimAction={(action, argument) => {
                    const aliases = {
                      write: 'core:save-note',
                      next: 'core:open-next-note',
                      prev: 'core:open-prev-note',
                      preview: 'view:toggle-preview',
                      'side-by-side': 'view:toggle-side-by-side',
                    } as const;
                    const command =
                      action === 'cmd'
                        ? resolveShortcutCommand(argument)
                        : aliases[action];
                    if (command)
                      executeShortcut(
                        store,
                        command,
                        view.current?.contentDOM ?? null,
                      );
                  }}
                  onView={(instance) => {
                    sync.current?.destroy();
                    sync.current = null;
                    view.current = instance;
                    setImageSelected(!!instance && !!imageAtCursor(instance));
                    setTableSelected(
                      !!instance && !!tableAtCursor(instance.state),
                    );
                    // Bind to the actual view lifecycle, including StrictMode's replay.
                    if (instance && preview.current) {
                      sync.current = createScrollSync(
                        instance,
                        preview.current,
                        () => renderedBody.current === currentBody.current,
                      );
                      sync.current.refresh(
                        mode === 'split' && preferences.syncScroll,
                      );
                    }
                  }}
                  onUpdate={(selectionChanged) => {
                    sync.current?.editorChanged(selectionChanged);
                    if (view.current) {
                      setImageSelected(!!imageAtCursor(view.current));
                      setTableSelected(!!tableAtCursor(view.current.state));
                    }
                  }}
                />
              ) : (
                <div className="editor-loading">
                  {inTrash
                    ? 'Restaura la nota para editarla.'
                    : 'Preparando editor…'}
                </div>
              )}
            </section>
            <aside
              ref={preview}
              className="pane pane--preview mde-preview-container"
              aria-label="Vista previa"
              tabIndex={-1}
            >
              <MarkdownPreview
                body={draft.body}
                readOnly={inTrash}
                onRendered={previewRendered}
              />
            </aside>
          </div>
          {floatingToolbar &&
            mode !== 'preview' &&
            createPortal(
              <div role="toolbar" aria-label="Formato de la selección">
                {renderFormatting(true)}
              </div>,
              floatingToolbar,
            )}
          <footer className="editor-statusbar">
            <span>{draft.body.length.toLocaleString()} caracteres</span>
            <span>
              {draft.body.trim() ? draft.body.trim().split(/\s+/u).length : 0}{' '}
              palabras
            </span>
            <span>Markdown</span>
            <UiSlot name="editor-status-bar" />
            <span className="editor-save-state">
              {isSaving
                ? 'Guardando…'
                : draft.isDirty
                  ? 'Autoguardado pendiente'
                  : 'Guardado localmente'}
            </span>
          </footer>
        </>
      ) : (
        <div className="workspace-empty">
          <BookOpen size={32} strokeWidth={1.2} />
          <h2>Tu espacio de escritura</h2>
          <p>Selecciona una nota o crea una nueva.</p>
          <button type="button" className="button" onClick={onToggleSidebar}>
            Abrir biblioteca
          </button>
        </div>
      )}
      <UiSlot name="editor" />
      <UiSlot name="editor-floating-actions" />
    </main>
  );
}

function EditorMetadata({ disabled }: { disabled: boolean }) {
  const noteId = useWorkspace((state) => state.document.noteId);
  const metadata = useWorkspace((state) => state.document.metadata);
  const update = useWorkspace((state) => state.updateDraft);
  const books = useWorkspace((state) => state.library.notebooks);
  const [tag, setTag] = useState('');
  const commitTag = () => {
    const value = tag.trim();
    if (value && !metadata.tags.includes(value) && metadata.tags.length < 32)
      update({ metadata: { ...metadata, tags: [...metadata.tags, value] } });
    setTag('');
  };
  return (
    <div className="editor-meta">
      <NotebookPicker
        key={noteId}
        notebooks={books}
        value={metadata.notebookId}
        disabled={disabled}
        onChange={(notebookId) =>
          update({ metadata: { ...metadata, notebookId } })
        }
      />
      <StatusPicker
        key={`status-${noteId}`}
        value={metadata.status}
        disabled={disabled}
        onChange={(status) => update({ metadata: { ...metadata, status } })}
      />
      <div className="editor-tags">
        {metadata.tags.map((name) => (
          <button
            key={name}
            type="button"
            className="remove-tag"
            disabled={disabled}
            title={`Quitar etiqueta ${name}`}
            onClick={() =>
              update({
                metadata: {
                  ...metadata,
                  tags: metadata.tags.filter((value) => value !== name),
                },
              })
            }
          >
            <TagBadge name={name} />
          </button>
        ))}
        <input
          aria-label="Añadir etiqueta"
          placeholder="Añadir etiquetas"
          disabled={disabled || metadata.tags.length >= 32}
          maxLength={40}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          onBlur={commitTag}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commitTag();
            }
          }}
        />
      </div>
    </div>
  );
}

const formatButtons = [
  { command: 'core:strong', icon: Bold, label: 'Negrita' },
  { command: 'core:emphasize', icon: Italic, label: 'Cursiva' },
  {
    command: 'core:strikethrough',
    icon: Strikethrough,
    label: 'Tachado',
  },
  { command: 'core:toggle-heading-2', icon: Heading, label: 'Encabezado' },
  { command: 'core:toggle-blockquote', icon: Quote, label: 'Cita' },
  { command: 'core:toggle-inline-code', icon: Code2, label: 'Código' },
  {
    command: 'core:toggle-inline-mark-tag',
    icon: Highlighter,
    label: 'Resaltar',
  },
  {
    command: 'core:toggle-bulleted-list',
    icon: List,
    label: 'Lista con viñetas',
  },
  {
    command: 'core:toggle-numbered-list',
    icon: ListOrdered,
    label: 'Lista numerada',
  },
  {
    command: 'core:toggle-task-list',
    icon: ListChecks,
    label: 'Lista de tareas',
  },
  { command: 'core:insert-link', icon: Link, label: 'Enlace' },
  { command: 'core:insert-horizontal-rule', icon: Minus, label: 'Separador' },
] satisfies {
  command: keyof typeof editorCommands;
  icon: typeof Bold;
  label: string;
}[];
