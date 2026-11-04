import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextAction {
  label: string;
  run: () => void;
  disabled?: boolean;
}
export function ContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: ContextAction[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    menu.current
      ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target))
        close.current();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label="Acciones"
      data-shortcut-input
      className="context-menu popover"
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - 260)),
        top: Math.max(
          8,
          Math.min(y, window.innerHeight - actions.length * 38 - 16),
        ),
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          onClose();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const buttons = [
            ...menu.current!.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ),
          ];
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (current +
                    (event.key === 'ArrowDown' ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          role="menuitem"
          type="button"
          disabled={action.disabled}
          onClick={() => {
            action.run();
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
