import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

export function IconButton({
  icon: Icon,
  label,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      {...props}
      type="button"
      className={`icon-button ${props.className ?? ''}`}
      aria-label={label}
      title={props.title ?? label}
      aria-pressed={active}
    >
      <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}
