import { z } from './validation';

// Command IDs and scopes follow Inkdrop's command/keymap model. Only commands
// implemented by this host are exposed; values never evaluate JavaScript.
export const shortcutCommands = [
  {
    id: 'application:open-preferences',
    label: 'Abrir Preferencias',
    scope: 'app',
    key: 'Mod-,',
  },
  { id: 'core:new-note', label: 'Nueva nota', scope: 'app', key: 'Mod-n' },
  {
    id: 'core:choose-template',
    label: 'Elegir plantilla para nota vacía',
    scope: 'app',
    key: 'Mod-t',
  },
  { id: 'core:save-note', label: 'Guardar nota', scope: 'app', key: 'Mod-s' },
  {
    id: 'editor:find',
    label: 'Buscar en la nota',
    scope: 'editor',
    key: 'Mod-f',
  },
  {
    id: 'editor:close-search',
    label: 'Cerrar búsqueda',
    scope: 'editor',
    key: 'Escape',
  },
  {
    id: 'editor:find-next',
    label: 'Siguiente coincidencia',
    scope: 'editor',
    key: 'Mod-g',
  },
  {
    id: 'editor:find-previous',
    label: 'Coincidencia anterior',
    scope: 'editor',
    key: 'Mod-Shift-g',
  },
  {
    id: 'core:focus-search',
    label: 'Filtrar notas',
    scope: 'app',
    key: 'Mod-Shift-f',
  },
  {
    id: 'core:find-global',
    label: 'Buscar en toda la biblioteca',
    scope: 'app',
    key: 'Mod-Alt-Shift-f',
  },
  {
    id: 'core:find-clear',
    label: 'Limpiar filtro',
    scope: 'search',
    key: 'Escape',
  },
  {
    id: 'core:pin-note',
    label: 'Fijar o desfijar nota',
    scope: 'note-list',
    key: 'p',
  },
  {
    id: 'editor:toggle-drawer',
    label: 'Abrir acciones de la nota',
    scope: 'app',
    key: 'Mod-j',
  },
  {
    id: 'editor:status-none',
    label: 'Estado: Sin estado',
    scope: 'app',
    key: 'Shift-Alt-1',
    macKey: 'Meta-Ctrl-1',
  },
  {
    id: 'editor:status-active',
    label: 'Estado: Activo',
    scope: 'app',
    key: 'Shift-Alt-2',
    macKey: 'Meta-Ctrl-2',
  },
  {
    id: 'editor:status-onhold',
    label: 'Estado: En espera',
    scope: 'app',
    key: 'Shift-Alt-3',
    macKey: 'Meta-Ctrl-3',
  },
  {
    id: 'editor:status-completed',
    label: 'Estado: Completado',
    scope: 'app',
    key: 'Shift-Alt-4',
    macKey: 'Meta-Ctrl-4',
  },
  {
    id: 'editor:status-dropped',
    label: 'Estado: Descartado',
    scope: 'app',
    key: 'Shift-Alt-5',
    macKey: 'Meta-Ctrl-5',
  },
  {
    id: 'view:toggle-sidebar',
    label: 'Mostrar u ocultar biblioteca',
    scope: 'app',
    key: 'Mod-Shift-b',
  },
  {
    id: 'view:toggle-distraction-free',
    label: 'Modo concentración',
    scope: 'app',
    key: 'Mod-Shift-d',
  },
  {
    id: 'view:toggle-preview',
    label: 'Alternar vista previa',
    scope: 'app',
    key: 'Mod-e',
  },
  {
    id: 'view:toggle-side-by-side',
    label: 'Alternar vista dividida',
    scope: 'app',
    key: 'Mod-p',
  },
  { id: 'editor:toggle-bold', label: 'Negrita', scope: 'editor', key: 'Mod-b' },
  {
    id: 'editor:toggle-italic',
    label: 'Cursiva',
    scope: 'editor',
    key: 'Mod-i',
  },
  {
    id: 'editor:toggle-strikethrough',
    label: 'Tachado',
    scope: 'editor',
    key: 'Mod-Shift-x',
  },
  {
    id: 'editor:insert-link',
    label: 'Insertar enlace',
    scope: 'editor',
    key: 'Mod-k',
  },
  {
    id: 'editor:toggle-line-wrapping',
    label: 'Alternar ajuste de líneas',
    scope: 'app',
    key: '',
  },
  {
    id: 'editor:toggle-line-numbers',
    label: 'Alternar números de línea',
    scope: 'app',
    key: '',
  },
] as const;
export type ShortcutCommand = (typeof shortcutCommands)[number]['id'];
const commandIdSchema = z.enum(shortcutCommands.map((command) => command.id));
export const keystrokeSchema = z
  .string()
  .max(80)
  .refine(
    (value) =>
      value === '' ||
      value
        .split(' ')
        .every((stroke) =>
          /^(?:(?:Mod|Ctrl|Alt|Shift|Meta)-)*(?:[a-z0-9,./;=[\]\\`'-]|Enter|Escape|Tab|Backspace|Delete|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[0-2]))$/.test(
            stroke,
          ),
        ),
    'Usa, por ejemplo, Mod-Shift-b o Mod-k Mod-b.',
  );
export const keybindingsSchema = z
  .array(
    z.object({ command: commandIdSchema, keystroke: keystrokeSchema }).strict(),
  )
  .max(shortcutCommands.length)
  .refine(
    (values) =>
      new Set(values.map((value) => value.command)).size === values.length,
  );
export type KeybindingOverride = z.output<typeof keybindingsSchema>[number];

export function shortcutFor(
  command: (typeof shortcutCommands)[number],
  overrides: readonly KeybindingOverride[],
  mac = false,
) {
  return (
    overrides.find((binding) => binding.command === command.id)?.keystroke ??
    (mac && 'macKey' in command ? command.macKey : command.key)
  );
}

export function shortcutConflict(
  command: ShortcutCommand,
  keystroke: string,
  overrides: readonly KeybindingOverride[],
  mac: boolean,
) {
  const normalize = (value: string) =>
    value
      .split(' ')
      .map((stroke) => {
        const prefix =
          stroke.match(/^(?:(?:Mod|Ctrl|Alt|Shift|Meta)-)*/)?.[0] ?? '';
        const modifiers = new Set(prefix.split('-'));
        return [
          modifiers.has('Ctrl') || (!mac && modifiers.has('Mod')),
          modifiers.has('Meta') || (mac && modifiers.has('Mod')),
          modifiers.has('Alt'),
          modifiers.has('Shift'),
          stroke.slice(prefix.length).toLowerCase(),
        ].join(':');
      })
      .join(' ');
  if (!keystroke) return;
  const selected = normalize(keystroke);
  return shortcutCommands.find((candidate) => {
    if (candidate.id === command) return false;
    const scope = shortcutCommands.find((item) => item.id === command)?.scope;
    if (
      scope !== 'app' &&
      candidate.scope !== 'app' &&
      candidate.scope !== scope
    )
      return false;
    const shortcut = shortcutFor(candidate, overrides, mac);
    if (!shortcut) return false;
    const other = normalize(shortcut);
    return (
      selected === other ||
      selected.startsWith(other + ' ') ||
      other.startsWith(selected + ' ')
    );
  });
}
