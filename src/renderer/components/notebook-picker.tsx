import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Notebook } from '../../shared/library';
import { NotebookIcon } from './notebook-icon';
import { useNativePopover } from './use-native-popover';
import {
  filterNotebookTree,
  matchesNotebook,
  notebookTree,
} from '../notebooks/notebook-hierarchy';

interface Props {
  notebooks: Notebook[];
  value: string | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
}

export function NotebookPicker({
  notebooks,
  value,
  disabled,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const anchor = `--notebook-${id.replace(/[^a-z0-9_-]/gi, '')}`;
  const entries = useMemo(() => notebookTree(notebooks), [notebooks]);
  const selected = entries.find((entry) => entry.notebook.id === value);
  const label = selected?.notebook.name ?? 'Sin notebook';
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  return (
    <div className="notebook-picker">
      <button
        ref={trigger}
        type="button"
        className="notebook-picker-trigger"
        style={{ anchorName: anchor }}
        aria-label={`Notebook de la nota: ${label}`}
        aria-haspopup="dialog"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={selected?.path.join(' / ') ?? label}
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <NotebookIcon name={selected?.notebook.icon ?? 'inbox'} size={17} />
        <span>{label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <NotebookMenu
          id={id}
          anchor={anchor}
          invoker={trigger}
          entries={entries}
          value={value}
          onClose={close}
          onSelect={(next) => {
            if (next !== value) onChange(next);
            close(true);
          }}
        />
      )}
    </div>
  );
}

function NotebookMenu({
  id,
  anchor,
  invoker,
  entries,
  value,
  onClose,
  onSelect,
}: {
  id: string;
  anchor: string;
  invoker: RefObject<HTMLButtonElement | null>;
  entries: ReturnType<typeof notebookTree>;
  value: string | null;
  onClose: (restoreFocus: boolean) => void;
  onSelect: (value: string | null) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState<string | null | undefined>(
    value,
  );
  const choices = [
    ...(matchesNotebook('Sin notebook', query)
      ? [
          {
            id: null,
            name: 'Sin notebook',
            path: 'Sin notebook',
            depth: 0,
            icon: 'inbox' as const,
          },
        ]
      : []),
    ...filterNotebookTree(entries, query).map(({ notebook, path, depth }) => ({
      ...notebook,
      path: path.join(' / '),
      depth,
    })),
  ];
  const active =
    choices.find((choice) => choice.id === highlighted) ??
    choices.find((choice) => matchesNotebook(choice.path, query));
  const activeIndex = active ? choices.indexOf(active) : -1;
  const events = useNativePopover(popup, invoker, search, onClose);
  useEffect(() => {
    popup.current
      ?.querySelector('[data-highlighted=true]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active?.id]);
  return (
    <div
      {...events}
      ref={popup}
      id={id}
      popover="auto"
      role="dialog"
      aria-label="Seleccionar notebook"
      className="notebook-picker-menu"
      data-shortcut-input
      style={{ positionAnchor: anchor }}
    >
      <label className="notebook-picker-search">
        <Search size={18} aria-hidden="true" />
        <input
          ref={search}
          role="combobox"
          aria-label="Buscar notebooks"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={`${id}-options`}
          aria-activedescendant={
            active ? `${id}-option-${activeIndex}` : undefined
          }
          placeholder="Buscar notebooks…"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(undefined);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onClose(true);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (active) onSelect(active.id);
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!choices.length) return;
              const direction = event.key === 'ArrowDown' ? 1 : -1;
              const next =
                (activeIndex + direction + choices.length) % choices.length;
              setHighlighted(choices[next]?.id);
            }
          }}
        />
      </label>
      <div
        className="notebook-picker-options"
        id={`${id}-options`}
        role="listbox"
        aria-label="Notebooks"
      >
        {choices.map((choice, index) => (
          <button
            key={choice.id ?? 'unfiled'}
            id={`${id}-option-${index}`}
            type="button"
            role="option"
            aria-label={choice.path}
            aria-selected={choice.id === value}
            className="notebook-picker-option"
            data-highlighted={choice.id === active?.id}
            style={{
              paddingInlineStart: `min(calc(var(--12px) + ${choice.depth} * var(--16px)), 45%)`,
            }}
            title={choice.path}
            tabIndex={-1}
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => setHighlighted(choice.id)}
            onClick={() => onSelect(choice.id)}
          >
            <NotebookIcon name={choice.icon} size={17} />
            <span>{choice.name}</span>
            {choice.id === value && <Check size={15} aria-hidden="true" />}
          </button>
        ))}
        {!choices.length && (
          <p className="notebook-picker-empty" role="status">
            No se encontraron notebooks.
          </p>
        )}
      </div>
    </div>
  );
}
