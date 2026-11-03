import { useRef } from 'react';

export function PanelDivider({
  label,
  width,
  min,
  max,
  onChange,
  onCommit,
}: {
  label: string;
  width: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
  onCommit: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number; value: number } | null>(null);
  const clamp = (value: number) =>
    Math.max(min, Math.min(max, Math.round(value)));
  return (
    <div
      className="panel-divider"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width, value: width };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const value = clamp(
          drag.current.width + event.clientX - drag.current.x,
        );
        drag.current.value = value;
        onChange(value);
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        onCommit(drag.current.value);
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        if (drag.current) onChange(drag.current.width);
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const value = clamp(width + (event.key === 'ArrowRight' ? 8 : -8));
          onChange(value);
          onCommit(value);
        }
      }}
    />
  );
}
