import { AlignLeft, Columns3, Rows3, Table2 } from 'lucide-react';
import { editorShortcutCommands } from '../../shared/editor-keybindings';
import { tableCommands } from '../editor/table-editor';
import { IconButton } from './icon-button';

type TableCommand = keyof typeof tableCommands;
const groups = [
  {
    label: 'Alineación de columna',
    icon: AlignLeft,
    actions: ['align-left', 'align-center', 'align-right', 'align-none'],
  },
  {
    label: 'Editar filas',
    icon: Rows3,
    actions: ['insert-row', 'delete-row', 'move-row-up', 'move-row-down'],
  },
  {
    label: 'Editar columnas',
    icon: Columns3,
    actions: [
      'insert-column',
      'delete-column',
      'move-column-left',
      'move-column-right',
    ],
  },
] as const;

export function TableToolbar({
  run,
}: {
  run: (command: TableCommand) => void;
}) {
  return (
    <>
      <IconButton
        icon={Table2}
        label="Formatear tabla"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run('table-editor:format')}
      />
      {groups.map(({ label, icon: Icon, actions }) => (
        <label className="table-toolbar-control" key={label}>
          <Icon size={14} aria-hidden="true" />
          <select
            aria-label={label}
            value=""
            onChange={(event) => run(event.target.value as TableCommand)}
          >
            <option value="" disabled>
              {label}
            </option>
            {actions.map((action) => {
              const command = `table-editor:${action}` as const;
              const title = editorShortcutCommands
                .find(({ id }) => id === command)
                ?.label.replace('Tabla · ', '');
              return (
                <option key={command} value={command}>
                  {title}
                </option>
              );
            })}
          </select>
        </label>
      ))}
    </>
  );
}
