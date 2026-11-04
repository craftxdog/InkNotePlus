import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { useWorkspace } from '../state/workspace-context';
import {
  shortcutCommands,
  shortcutFor,
  shortcutConflict,
  keystrokeSchema,
  type ShortcutCommand,
} from '../../shared/keybindings';
import { IconButton } from './icon-button';

export function Keybindings({ query }: { query: string }) {
  const preferences = useWorkspace((state) => state.preferences);
  const platform = useWorkspace((state) => state.platform);
  const normalized = query.toLocaleLowerCase();
  const builtIn = [...defaultKeymap, ...historyKeymap]
    .map((binding) => ({
      key:
        (platform === 'darwin'
          ? binding.mac
          : platform === 'win32'
            ? binding.win
            : binding.linux) ?? binding.key,
      command: binding.run?.name || binding.shift?.name || 'Editor',
    }))
    .filter(
      (binding): binding is { key: string; command: string } => !!binding.key,
    );
  return (
    <div className="keybinding-list">
      {shortcutCommands
        .filter((command) =>
          `${command.label} ${command.id} ${shortcutFor(command, preferences.keybindings)}`
            .toLocaleLowerCase()
            .includes(normalized),
        )
        .map((command) => (
          <ShortcutRow
            key={command.id}
            command={command.id}
            label={command.label}
            scope={command.scope}
            value={shortcutFor(command, preferences.keybindings)}
          />
        ))}
      <h4>Edición nativa · CodeMirror</h4>
      {builtIn
        .filter((binding) =>
          `${binding.command} ${binding.key}`
            .toLocaleLowerCase()
            .includes(normalized),
        )
        .map((binding, index) => (
          <div className="keybinding-row native-keybinding" key={index}>
            <span>
              <strong>{binding.command}</strong>
              <small>.cm-editor</small>
            </span>
            <kbd>{binding.key}</kbd>
          </div>
        ))}
    </div>
  );
}
function ShortcutRow({
  command,
  label,
  scope,
  value,
}: {
  command: ShortcutCommand;
  label: string;
  scope: string;
  value: string;
}) {
  const [input, setInput] = useState(value);
  useEffect(() => setInput(value), [value]);
  const [error, setError] = useState('');
  const bindings = useWorkspace((state) => state.preferences.keybindings);
  const platform = useWorkspace((state) => state.platform);
  const update = useWorkspace((state) => state.updatePreferences);
  const commit = () => {
    const parsed = keystrokeSchema.safeParse(input.trim());
    if (!parsed.success) {
      setError('Formato no válido. Ejemplo: Mod-Shift-n');
      return;
    }
    const other = shortcutConflict(
      command,
      parsed.data,
      bindings,
      platform === 'darwin',
    );
    if (other) {
      setError(
        `Comparte una secuencia con ${other.label}. Cambia ese atajo primero.`,
      );
      return;
    }
    setError('');
    void update({
      keybindings: [
        ...bindings.filter((binding) => binding.command !== command),
        { command, keystroke: parsed.data },
      ],
    });
  };
  return (
    <div className="keybinding-row">
      <span>
        <strong>{label}</strong>
        <small>
          {command} · {scope === 'editor' ? '.cm-editor' : 'body'}
        </small>
        {error && <small role="alert">{error}</small>}
      </span>
      <input
        data-shortcut-input
        aria-label={`Atajo: ${label}`}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        placeholder="Sin atajo"
      />
      <IconButton
        icon={RotateCcw}
        label={`Restablecer atajo: ${label}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const fallback = shortcutCommands.find(
            (item) => item.id === command,
          )!.key;
          setInput(fallback);
          setError('');
          void update({
            keybindings: bindings.filter(
              (binding) => binding.command !== command,
            ),
          });
        }}
      />
    </div>
  );
}
