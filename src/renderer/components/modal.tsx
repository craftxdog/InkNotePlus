import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './icon-button';

export function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && dialog.current?.contains(active))
      active.blur();
    onClose();
  };
  useEffect(() => {
    const element = dialog.current;
    if (element?.showModal) element.showModal();
    else element?.setAttribute('open', '');
    return () => element?.close?.();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`app-dialog ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }
      }}
    >
      <header className="dialog-header">
        <h2>{title}</h2>
        <IconButton icon={X} label="Cerrar diálogo" onClick={close} />
      </header>
      {children}
    </dialog>
  );
}
