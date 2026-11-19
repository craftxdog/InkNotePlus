import { useEffect, useState } from 'react';
import { keystrokeSchema } from '../../shared/keybindings';

export function GlobalShortcutField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const trimmed = draft.trim();
  const valid =
    keystrokeSchema.safeParse(trimmed).success && !trimmed.includes(' ');
  return (
    <label>
      {label}
      <input
        data-shortcut-input
        type="text"
        placeholder="Por ejemplo, Mod-Shift-i"
        aria-invalid={!valid}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (valid && trimmed !== value) onChange(trimmed);
        }}
      />
      {!valid && (
        <small role="alert">Usa un único atajo, como Mod-Shift-i.</small>
      )}
    </label>
  );
}
