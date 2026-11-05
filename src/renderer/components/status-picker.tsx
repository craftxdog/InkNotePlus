import { useId, useRef, useState, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import type { NoteStatus } from '../../shared/note-metadata';
import { NoteStatusIcon, statusLabels } from './note-status';
import { useNativePopover } from './use-native-popover';

const statuses = Object.keys(statusLabels) as NoteStatus[];

export function StatusPicker({
  value,
  disabled,
  onChange,
}: {
  value: NoteStatus;
  disabled?: boolean;
  onChange: (value: NoteStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const invoker = useRef<HTMLButtonElement>(null);
  const id = useId();
  const anchor = `--status-${id.replace(/[^a-z0-9_-]/gi, '')}`;
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) invoker.current?.focus({ preventScroll: true });
  };
  return (
    <div className="status-picker">
      <button
        ref={invoker}
        type="button"
        className="status-picker-trigger"
        style={{ anchorName: anchor }}
        disabled={disabled}
        aria-label={`Estado de la nota: ${statusLabels[value]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        popoverTarget={id}
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
        <NoteStatusIcon status={value} size={17} />
        <span>{statusLabels[value]}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <StatusMenu
          id={id}
          anchor={anchor}
          invoker={invoker}
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

function StatusMenu({
  id,
  anchor,
  invoker,
  value,
  onClose,
  onSelect,
}: {
  id: string;
  anchor: string;
  invoker: RefObject<HTMLButtonElement | null>;
  value: NoteStatus;
  onClose: (restoreFocus: boolean) => void;
  onSelect: (value: NoteStatus) => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState(value);
  const events = useNativePopover(popup, invoker, selected, onClose);
  return (
    <div
      {...events}
      ref={popup}
      id={id}
      role="menu"
      aria-label="Estado de la nota"
      popover="auto"
      className="status-picker-menu"
      data-shortcut-input
      style={{ positionAnchor: anchor }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const rows = [
          ...popup.current!.querySelectorAll<HTMLButtonElement>(
            '[role=menuitemradio]',
          ),
        ];
        const current = rows.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? rows.length - 1
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) %
                rows.length;
        rows[next]?.focus();
      }}
    >
      {statuses.map((status) => (
        <button
          key={status}
          ref={status === value ? selected : undefined}
          type="button"
          value={status}
          role="menuitemradio"
          aria-checked={status === value}
          tabIndex={status === focused ? 0 : -1}
          className="status-picker-option"
          onFocus={() => setFocused(status)}
          onClick={() => onSelect(status)}
        >
          <NoteStatusIcon status={status} />
          <span>{statusLabels[status]}</span>
        </button>
      ))}
    </div>
  );
}
