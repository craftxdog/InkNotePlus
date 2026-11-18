import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { Square, SquareCheck, X } from 'lucide-react';
import { activeOutlineIndex, noteOutline } from '../editor/note-outline';
import { IconButton } from './icon-button';

export function NoteOutlinePanel({
  body,
  currentLine,
  onJump,
  onClose,
}: {
  body: string;
  currentLine: number;
  onJump: (line: number) => void;
  onClose: () => void;
}) {
  const deferredBody = useDeferredValue(body);
  const items = useMemo(() => noteOutline(deferredBody), [deferredBody]);
  const active = activeOutlineIndex(items, currentLine);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  return (
    <aside
      className="note-outline"
      aria-label="Esquema de la nota"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
      }}
    >
      <header>
        <h2>Esquema</h2>
        <IconButton icon={X} label="Cerrar esquema" onClick={onClose} />
      </header>
      {items.length ? (
        <ol ref={list}>
          {items.map((item, index) => {
            const Icon = item.checked ? SquareCheck : Square;
            return (
              <li key={`${item.line}:${item.kind}`}>
                <button
                  type="button"
                  data-outline-kind={item.kind}
                  aria-current={index === active ? 'location' : undefined}
                  style={{
                    paddingInlineStart: `calc(var(--8px) + ${Math.max(item.level - 1, 0)} * var(--12px))`,
                  }}
                  onClick={() => onJump(item.line)}
                >
                  {item.kind === 'task' && (
                    <Icon size={14} aria-hidden="true" />
                  )}
                  <span>{item.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p role="status">Esta nota no tiene encabezados ni tareas.</p>
      )}
    </aside>
  );
}
