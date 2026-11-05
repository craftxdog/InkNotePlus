import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from 'react';
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
} from 'lucide-react';
import { imageAtCursor, resizeCurrentImage } from '../editor/image-dimensions';
import {
  insertManagedImages,
  type ImageImportError,
} from '../editor/image-insertion';
import { useWorkspace } from '../state/workspace-context';
import { MarkdownEditor } from '../editor/markdown-editor';
import { MarkdownPreview } from '../editor/markdown-preview';
import { formatSelection, type FormatCommand } from '../editor/formatting';
import type { NoteStatus } from '../../shared/note-metadata';
import { IconButton } from './icon-button';
import { TagBadge } from './tag-badge';
import { statusIcons, statusLabels } from './sidebar';
import { Modal } from './modal';
import { CommitRange } from './commit-range';
import { createScrollSync } from '../editor/scroll-sync';
import { NotebookPicker } from './notebook-picker';
import { UiSlot } from '../extensions/ui-slots';

export function DocumentWorkspace({
  onShowNotes,
  onToggleSidebar,
}: {
  onShowNotes: () => void;
  onToggleSidebar: () => void;
}) {
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
  const restore = useWorkspace((state) => state.restoreActiveNote);
  const trash = useWorkspace((state) => state.trashActiveNote);
  const importImage = useWorkspace((state) => state.importImage);
  const view = useRef<EditorView | null>(null);
  const preview = useRef<HTMLElement>(null);
  const sync = useRef<ReturnType<typeof createScrollSync> | null>(null);
  const currentBody = useRef(draft.body);
  currentBody.current = draft.body;
  const renderedBody = useRef<string | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [splitRatio, setSplitRatio] = useState(preferences.splitRatio);
  const [imageSelected, setImageSelected] = useState(false);
  const [imageError, setImageError] = useState<ImageImportError>(null);
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
                <button
                  type="button"
                  disabled={!draft.noteId}
                  onClick={() => {
                    void restore();
                  }}
                >
                  <RotateCcw size={16} />
                  Restaurar nota
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!draft.noteId}
                  onClick={() => setConfirmTrash(true)}
                >
                  <Trash2 size={16} />
                  Mover a papelera
                </button>
              )}
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
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === 's'
              ) {
                event.preventDefault();
                void save();
              }
            }}
          />
          <EditorMetadata disabled={inTrash} />
          <UiSlot name="editor-header" />
          <UiSlot name="editor-meta" />
          <div
            className="editor-toolbar"
            hidden={!preferences.showToolbar}
            role="toolbar"
            aria-label="Formato Markdown"
          >
            {formatButtons.map(({ command, icon, label }) => (
              <IconButton
                key={command}
                icon={icon}
                label={label}
                disabled={inTrash || mode === 'preview' || !nonce}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (view.current) formatSelection(view.current, command);
                }}
              />
            ))}
            <IconButton
              icon={ImagePlus}
              label="Insertar imagen"
              disabled={inTrash || mode === 'preview' || !nonce}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void insertImage()}
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
                  onView={(instance) => {
                    sync.current?.destroy();
                    sync.current = null;
                    view.current = instance;
                    setImageSelected(!!instance && !!imageAtCursor(instance));
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
                    if (view.current)
                      setImageSelected(!!imageAtCursor(view.current));
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
            >
              <MarkdownPreview
                body={draft.body}
                readOnly={inTrash}
                onRendered={previewRendered}
              />
            </aside>
          </div>
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
      {confirmTrash && (
        <Modal title="Mover a papelera" onClose={() => setConfirmTrash(false)}>
          <div className="dialog-form">
            <p>
              La nota se puede restaurar desde la papelera.
              {draft.isDirty
                ? ' Los cambios sin guardar permanecen sólo en esta sesión.'
                : ''}
            </p>
            <footer className="dialog-actions">
              <button
                className="button"
                type="button"
                onClick={() => setConfirmTrash(false)}
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => {
                  setConfirmTrash(false);
                  void trash();
                }}
              >
                Mover a papelera
              </button>
            </footer>
          </div>
        </Modal>
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
  const StatusIcon = statusIcons[metadata.status];
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
      <label className={`meta-select status-${metadata.status}`}>
        <StatusIcon size={16} />
        <span className="visually-hidden">Estado de la nota</span>
        <select
          aria-label="Estado de la nota"
          disabled={disabled}
          value={metadata.status}
          onChange={(event) =>
            update({
              metadata: {
                ...metadata,
                status: event.target.value as NoteStatus,
              },
            })
          }
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
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
  { command: 'bold', icon: Bold, label: 'Negrita' },
  { command: 'italic', icon: Italic, label: 'Cursiva' },
  { command: 'strike', icon: Strikethrough, label: 'Tachado' },
  { command: 'heading', icon: Heading, label: 'Encabezado' },
  { command: 'quote', icon: Quote, label: 'Cita' },
  { command: 'code', icon: Code2, label: 'Código' },
  { command: 'bullet', icon: List, label: 'Lista con viñetas' },
  { command: 'ordered', icon: ListOrdered, label: 'Lista numerada' },
  { command: 'link', icon: Link, label: 'Enlace' },
  { command: 'rule', icon: Minus, label: 'Separador' },
] satisfies { command: FormatCommand; icon: typeof Bold; label: string }[];
