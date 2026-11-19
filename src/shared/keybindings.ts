import { z } from './validation';
import { editorShortcutCommands } from './editor-keybindings';

// Command IDs and scopes follow Inkdrop's command/keymap model. Only commands
// implemented by this host are exposed; values never evaluate JavaScript.
export const shortcutCommands = [
  {
    id: 'window:reload',
    label: 'Recargar ventana',
    scope: 'app',
    key: 'Mod-r',
  },
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
    id: 'core:open-note-in-window',
    label: 'Abrir la nota en una ventana nueva',
    scope: 'app',
    key: 'Mod-Shift-n',
  },
  {
    id: 'core:duplicate-note',
    label: 'Duplicar nota',
    scope: 'app',
    key: 'Mod-d',
  },
  {
    id: 'editor:find',
    label: 'Buscar en la nota',
    scope: 'editor',
    key: 'Mod-f',
  },
  {
    id: 'preview:find',
    label: 'Buscar en la vista previa',
    scope: 'app',
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
    id: 'editor:find-prev',
    label: 'Coincidencia anterior',
    scope: 'editor',
    key: 'Mod-Shift-g',
  },
  {
    id: 'core:find',
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
    id: 'core:pin-note-to-top',
    label: 'Fijar o desfijar nota',
    scope: 'note-list',
    key: 'p',
  },
  {
    id: 'core:delete-note',
    label: 'Eliminar notas seleccionadas',
    scope: 'note-list',
    key: 'Delete',
    macKey: 'Mod-Backspace',
  },
  {
    id: 'core:show-editor-action-menu',
    label: 'Abrir acciones de la nota',
    scope: 'app',
    key: 'Mod-j',
  },
  {
    id: 'editor:change-note-status-none',
    label: 'Estado: Sin estado',
    scope: 'app',
    key: 'Shift-Alt-1',
    macKey: 'Meta-Ctrl-1',
  },
  {
    id: 'editor:change-note-status-active',
    label: 'Estado: Activo',
    scope: 'app',
    key: 'Shift-Alt-2',
    macKey: 'Meta-Ctrl-2',
  },
  {
    id: 'editor:change-note-status-onhold',
    label: 'Estado: En espera',
    scope: 'app',
    key: 'Shift-Alt-3',
    macKey: 'Meta-Ctrl-3',
  },
  {
    id: 'editor:change-note-status-completed',
    label: 'Estado: Completado',
    scope: 'app',
    key: 'Shift-Alt-4',
    macKey: 'Meta-Ctrl-4',
  },
  {
    id: 'editor:change-note-status-dropped',
    label: 'Estado: Descartado',
    scope: 'app',
    key: 'Shift-Alt-5',
    macKey: 'Meta-Ctrl-5',
  },
  {
    id: 'view:toggle-sidebar',
    label: 'Mostrar u ocultar biblioteca',
    scope: 'app',
    key: 'Mod-/',
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
  { id: 'core:strong', label: 'Negrita', scope: 'editor', key: 'Mod-b' },
  {
    id: 'core:emphasize',
    label: 'Cursiva',
    scope: 'editor',
    key: 'Mod-i',
  },
  {
    id: 'core:strikethrough',
    label: 'Tachado',
    scope: 'editor',
    key: 'Mod-Shift-x',
  },
  {
    id: 'core:insert-link',
    label: 'Insertar enlace',
    scope: 'editor',
    key: 'Mod-Alt-k',
  },
  {
    id: 'ai:assistant',
    label: 'Abrir el asistente de IA',
    scope: 'editor',
    key: 'Mod-Alt-i',
  },
  {
    id: 'ai:suggest',
    label: 'Sugerir cómo continuar el texto',
    scope: 'editor',
    key: 'Mod-Alt-\\',
  },
  {
    id: 'github:insert-snippet',
    label: 'Insertar fragmento de GitHub',
    scope: 'editor',
    key: '',
  },
  {
    id: 'core:move-note',
    label: 'Mover nota a un notebook',
    scope: 'app',
    key: 'Mod-Alt-m',
    macKey: 'Meta-Ctrl-m',
  },
  {
    id: 'core:move-note-from-list',
    label: 'Mover notas seleccionadas',
    scope: 'note-list',
    key: 'm',
  },
  {
    id: 'core:toggle-telescope',
    label: 'Buscar comandos',
    scope: 'app',
    key: 'Mod-k',
  },
  { id: 'editor:focus', label: 'Enfocar la nota', scope: 'app', key: '' },
  { id: 'editor:focus-mde', label: 'Enfocar el editor', scope: 'app', key: '' },
  {
    id: 'editor:focus-preview',
    label: 'Enfocar vista previa',
    scope: 'app',
    key: '',
  },
  {
    id: 'editor:focus-title',
    label: 'Enfocar el título',
    scope: 'app',
    key: '',
  },
  {
    id: 'editor:focus-and-go-doc-start',
    label: 'Ir al inicio de la nota',
    scope: 'app',
    key: '',
  },
  {
    id: 'core:navigate-back',
    label: 'Volver a la nota visitada',
    scope: 'app',
    key: 'Alt-ArrowLeft',
    macKey: 'Meta-ArrowLeft',
  },
  {
    id: 'core:navigate-forward',
    label: 'Avanzar en el historial de notas',
    scope: 'app',
    key: 'Alt-ArrowRight',
    macKey: 'Meta-ArrowRight',
  },
  {
    id: 'core:open-prev-note',
    label: 'Nota anterior',
    scope: 'app',
    key: 'Mod-Shift-[',
  },
  {
    id: 'core:open-next-note',
    label: 'Nota siguiente',
    scope: 'app',
    key: 'Mod-Shift-]',
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
  {
    id: 'editor:toggle-readable-line-length',
    label: 'Alternar anchura de lectura',
    scope: 'app',
    key: '',
  },
  {
    id: 'core:copy-note-link',
    label: 'Copiar enlace Markdown de la nota',
    scope: 'app',
    key: '',
  },
  ...(
    [
      ['view:sort-by-title-in-asc', 'Ordenar por título (A-Z)'],
      ['view:sort-by-title-in-desc', 'Ordenar por título (Z-A)'],
      ['view:sort-by-date-created-in-asc', 'Ordenar por creación (antiguas)'],
      ['view:sort-by-date-created-in-desc', 'Ordenar por creación (recientes)'],
      ['view:sort-by-date-updated-in-asc', 'Ordenar por cambios (antiguas)'],
      ['view:sort-by-date-updated-in-desc', 'Ordenar por cambios (recientes)'],
    ] as const
  ).map(([id, label]) => ({ id, label, scope: 'app' as const, key: '' })),
  ...(
    [
      ['core:telescope-commands', 'Buscar sólo comandos'],
      ['core:telescope-notebooks', 'Ir a un notebook'],
      ['core:telescope-tags', 'Ir a una etiqueta'],
      ['telescope-toc:show', 'Buscar en el esquema de la nota'],
      ['telescope-themes:show', 'Cambiar de tema'],
      ['view:toggle-outline', 'Mostrar u ocultar esquema de la nota'],
      ['core:show-note-revisions', 'Ver historial de revisiones'],
      ['import-markdown:import-from-file', 'Importar archivos'],
      ['inknote:import-folder', 'Importar carpeta'],
      ['inknote:import-apple-notes', 'Importar desde Apple Notes'],
      ['export-as-markdown:all', 'Exportar biblioteca como Markdown'],
      ['export-as-html:all', 'Exportar biblioteca como HTML'],
    ] as const
  ).map(([id, label]) => ({ id, label, scope: 'app' as const, key: '' })),
  { id: 'view:show-editor', label: 'Sólo editor', scope: 'app', key: '' },
  {
    id: 'view:show-side-by-side',
    label: 'Editor y vista previa',
    scope: 'app',
    key: '',
  },
  {
    id: 'view:show-preview',
    label: 'Sólo vista previa',
    scope: 'app',
    key: '',
  },
  ...editorShortcutCommands,
] as const;
export type ShortcutCommand = (typeof shortcutCommands)[number]['id'];
export const noteSortCommands = {
  'view:sort-by-title-in-asc': 'title-asc',
  'view:sort-by-title-in-desc': 'title-desc',
  'view:sort-by-date-created-in-asc': 'created-asc',
  'view:sort-by-date-created-in-desc': 'created-desc',
  'view:sort-by-date-updated-in-asc': 'updated-asc',
  'view:sort-by-date-updated-in-desc': 'updated-desc',
} as const;
const legacyCommandIds: Readonly<Record<string, ShortcutCommand>> = {
  'editor:toggle-bold': 'core:strong',
  'editor:toggle-italic': 'core:emphasize',
  'editor:toggle-strikethrough': 'core:strikethrough',
  'editor:insert-link': 'core:insert-link',
  'editor:find-previous': 'editor:find-prev',
  'core:focus-search': 'core:find',
  'core:pin-note': 'core:pin-note-to-top',
  'editor:toggle-drawer': 'core:show-editor-action-menu',
  'editor:status-none': 'editor:change-note-status-none',
  'editor:status-active': 'editor:change-note-status-active',
  'editor:status-onhold': 'editor:change-note-status-onhold',
  'editor:status-completed': 'editor:change-note-status-completed',
  'editor:status-dropped': 'editor:change-note-status-dropped',
};
const commandIdSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && Object.hasOwn(legacyCommandIds, value)
      ? legacyCommandIds[value]
      : value,
  z.enum(shortcutCommands.map((command) => command.id)),
);
export function resolveShortcutCommand(value: unknown) {
  const result = commandIdSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
export const keystrokeSchema = z
  .string()
  .max(80)
  .refine(
    (value) =>
      value === '' ||
      value
        .split(' ')
        .every((stroke) =>
          /^(?:(?:Mod|Ctrl|Alt|Shift|Meta)-)*(?:[a-z0-9,./;=[\]\\`'-]|Enter|Escape|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[0-2]))$/.test(
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
    // The same key searches whichever pane has the focus.
    if (
      [candidate.id, command].includes('editor:find') &&
      [candidate.id, command].includes('preview:find')
    )
      return false;
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
