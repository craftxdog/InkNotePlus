import type { ReactNode } from 'react';
import { useWorkspace } from '../state/workspace-context';

export function SettingGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="settings-group">
      <legend>
        {icon}
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
export function FontField({
  label,
  setting,
  placeholder,
}: {
  label: string;
  setting: 'editorFontFamily' | 'previewFontFamily';
  placeholder: string;
}) {
  const value = useWorkspace((state) => state.preferences[setting]);
  const update = useWorkspace((state) => state.updatePreferences);
  return (
    <label>
      {label}
      <input
        type="text"
        maxLength={240}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(event) => void update({ [setting]: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <small className="settings-description">
        Usa fuentes instaladas. Vacío restaura la fuente del tema.
      </small>
    </label>
  );
}
export function LineHeight({
  label,
  setting,
}: {
  label: string;
  setting: 'editorLineHeight' | 'previewLineHeight';
}) {
  const value = useWorkspace((state) => state.preferences[setting]);
  const update = useWorkspace((state) => state.updatePreferences);
  return (
    <label>
      {label}
      <input
        type="number"
        min={1}
        max={3}
        step={0.1}
        defaultValue={value}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (next >= 1 && next <= 3) void update({ [setting]: next });
          else event.target.value = String(value);
        }}
      />
    </label>
  );
}
