import { useEffect, useState } from 'react';

// Preview locally while dragging; persist once the pointer/keyboard gesture ends.
export function CommitRange({
  value,
  min,
  max,
  label,
  unit,
  onPreview,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  unit?: string;
  onPreview?: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <>
      {unit && (
        <output>
          {draft} {unit}
        </output>
      )}
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={draft}
        onChange={(event) => {
          const next = Number(event.target.value);
          setDraft(next);
          onPreview?.(next);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onPointerCancel={() => {
          setDraft(value);
          onPreview?.(value);
        }}
      />
    </>
  );
}
