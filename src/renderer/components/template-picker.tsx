import { useEffect, useRef, useState } from 'react';
import { Search, Files } from 'lucide-react';
import { Modal } from './modal';
import { useWorkspace } from '../state/workspace-context';
import { MarkdownPreview } from '../editor/markdown-preview';
import { builtinTemplates } from '../templates/builtin-templates';
import { readTemplate } from '../templates/template-engine';
import type { NoteMetadata } from '../../shared/note-metadata';

interface Choice {
  id: string;
  title: string;
  body: string;
  metadata?: NoteMetadata;
  category: string;
}
export default function TemplatePicker() {
  const close = useWorkspace((state) => state.setTemplatePickerOpen);
  const fetchTemplates = useWorkspace((state) => state.getTemplateNotes);
  const apply = useWorkspace((state) => state.applyTemplate);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState<Choice[]>([]);
  const [selected, setSelected] = useState(0);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const builtin = builtinTemplates.filter((template) =>
    `${template.title} ${template.category}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const choices: Choice[] = [...custom, ...builtin];
  const choice = choices[selected];
  useEffect(() => {
    let active = true;
    setBusy(true);
    const timer = setTimeout(() => {
      void fetchTemplates(query, offset)
        .then((result) => {
          if (!active) return;
          if (result.ok) {
            setCustom((previous) => [
              ...(offset ? previous : []),
              ...result.data.map((note) => ({
                ...note,
                category: 'Personalizadas',
              })),
            ]);
            setMore(result.data.length === 100);
            setError(null);
          } else setError('No se pudieron cargar las plantillas.');
          setBusy(false);
        })
        .catch(() => {
          if (active) {
            setError('No se pudieron cargar las plantillas.');
            setBusy(false);
          }
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, offset, fetchTemplates]);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected=true]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);
  let description = '';
  try {
    if (choice)
      description = readTemplate(choice.body).config.description ?? '';
  } catch {
    description = 'La plantilla contiene frontmatter no válido.';
  }
  const submit = () => {
    if (!choice || busy) return;
    setBusy(true);
    void apply(choice).then((message) => {
      setError(message);
      setBusy(false);
    });
  };
  return (
    <Modal
      title="Elegir plantilla"
      className="template-picker-dialog"
      onClose={() => close(false)}
    >
      <div
        className="template-picker-body"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected((value) =>
              Math.max(
                0,
                Math.min(
                  choices.length - 1,
                  value + (event.key === 'ArrowDown' ? 1 : -1),
                ),
              ),
            );
          }
          if (
            event.key === 'Enter' &&
            !(event.target instanceof HTMLButtonElement)
          ) {
            event.preventDefault();
            submit();
          }
        }}
      >
        <label className="settings-search">
          <Search size={16} />
          <input
            autoFocus
            type="search"
            aria-label="Buscar plantillas"
            placeholder="Buscar plantillas"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
              setSelected(0);
            }}
          />
        </label>
        <div className="template-picker-panes">
          <div
            ref={list}
            className="template-choices"
            role="listbox"
            aria-label="Plantillas"
            aria-busy={busy}
          >
            {choices.map((template, index) => (
              <button
                role="option"
                type="button"
                key={template.id}
                aria-selected={selected === index}
                onClick={() => setSelected(index)}
                onDoubleClick={() => {
                  void apply(template).then(setError);
                }}
              >
                <Files size={16} />
                <span>
                  {template.title}
                  <small>{template.category}</small>
                </span>
              </button>
            ))}
            {!busy && !choices.length && <p>No se encontraron plantillas.</p>}
          </div>
          <div className="template-preview">
            {choice && (
              <>
                <h3>{choice.title}</h3>
                <p className="settings-description">{description}</p>
                <MarkdownPreview body={choice.body} readOnly />
              </>
            )}
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <footer className="dialog-actions">
          {more && (
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => setOffset((value) => value + 100)}
            >
              Cargar más
            </button>
          )}
          <button
            className="button button--primary"
            type="button"
            disabled={!choice || busy}
            onClick={submit}
          >
            {busy ? 'Cargando…' : 'Aplicar plantilla'}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
