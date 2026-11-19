import type { MenuItemConstructorOptions } from 'electron';
import {
  shortcutCommands,
  shortcutFor,
  type KeybindingOverride,
  type ShortcutCommand,
} from '../shared/keybindings';

const specialKeys: Readonly<Record<string, string>> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Enter: 'Return',
  Escape: 'Esc',
};
const modifiers: Readonly<Record<string, string>> = {
  Mod: 'CmdOrCtrl',
  Meta: 'Cmd',
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
};

export function toAccelerator(keystroke: string) {
  if (!keystroke || keystroke.includes(' ')) return undefined;
  const prefix =
    /^(?:(?:Mod|Ctrl|Alt|Shift|Meta)-)*/.exec(keystroke)?.[0] ?? '';
  const key = keystroke.slice(prefix.length);
  return [
    ...prefix
      .split('-')
      .filter(Boolean)
      .map((modifier) => modifiers[modifier]),
    specialKeys[key] ?? (key.length === 1 ? key.toUpperCase() : key),
  ].join('+');
}

// In text fields macOS keeps Cmd+Arrow for the caret. A menu accelerator would
// take the key whenever the renderer leaves it to the native control.
const nativeOnMac = new Set<ShortcutCommand>([
  'core:navigate-back',
  'core:navigate-forward',
]);

export function appMenuTemplate(options: {
  platform: NodeJS.Platform;
  appName: string;
  keybindings: readonly KeybindingOverride[];
  developmentMode: boolean;
  sendCommand: (command: ShortcutCommand) => void;
  checkForUpdates: () => void;
  openProject: () => void;
}): MenuItemConstructorOptions[] {
  const mac = options.platform === 'darwin';
  const separator: MenuItemConstructorOptions = { type: 'separator' };
  const command = (
    id: ShortcutCommand,
    label: string,
  ): MenuItemConstructorOptions => {
    const definition = shortcutCommands.find((item) => item.id === id)!;
    const accelerator =
      mac && nativeOnMac.has(id)
        ? undefined
        : toAccelerator(shortcutFor(definition, options.keybindings, mac));
    return {
      id,
      label,
      click: () => options.sendCommand(id),
      ...(accelerator
        ? {
            accelerator,
            // The renderer resolves shortcuts by context. The menu only shows them.
            ...(mac ? {} : { registerAccelerator: false }),
          }
        : {}),
    };
  };
  const preferences = command('application:open-preferences', 'Preferencias…');
  const updates: MenuItemConstructorOptions = {
    label: 'Buscar actualizaciones…',
    click: () => options.checkForUpdates(),
  };
  return [
    ...(mac
      ? ([
          {
            label: options.appName,
            submenu: [
              { role: 'about', label: `Acerca de ${options.appName}` },
              updates,
              separator,
              preferences,
              separator,
              { role: 'services', label: 'Servicios' },
              separator,
              { role: 'hide', label: `Ocultar ${options.appName}` },
              { role: 'hideOthers', label: 'Ocultar otros' },
              { role: 'unhide', label: 'Mostrar todo' },
              separator,
              { role: 'quit', label: `Salir de ${options.appName}` },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'Archivo',
      submenu: [
        command('core:new-note', 'Nueva nota'),
        command('core:choose-template', 'Elegir plantilla…'),
        command('core:duplicate-note', 'Duplicar nota'),
        command('core:open-note-in-window', 'Abrir en una ventana nueva'),
        command('core:save-note', 'Guardar'),
        command('core:show-note-revisions', 'Historial de revisiones…'),
        separator,
        command('import-markdown:import-from-file', 'Importar archivos…'),
        command('inknote:import-folder', 'Importar carpeta…'),
        ...(mac
          ? [
              command(
                'inknote:import-apple-notes',
                'Importar desde Apple Notes…',
              ),
            ]
          : []),
        {
          label: 'Exportar biblioteca',
          submenu: [
            command('export-as-markdown:all', 'Como Markdown…'),
            command('export-as-html:all', 'Como HTML…'),
          ],
        },
        ...(mac
          ? [separator, { role: 'close', label: 'Cerrar ventana' } as const]
          : [
              separator,
              preferences,
              separator,
              { role: 'quit', label: 'Salir' } as const,
            ]),
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        separator,
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
        separator,
        command('editor:find', 'Buscar en la nota'),
        command('core:find', 'Filtrar notas'),
        command('core:find-global', 'Buscar en toda la biblioteca'),
      ],
    },
    {
      label: 'Vista',
      submenu: [
        command('view:show-editor', 'Sólo editor'),
        command('view:show-side-by-side', 'Editor y vista previa'),
        command('view:show-preview', 'Sólo vista previa'),
        separator,
        command('view:toggle-sidebar', 'Mostrar u ocultar biblioteca'),
        command('view:toggle-outline', 'Mostrar u ocultar esquema'),
        command('view:toggle-distraction-free', 'Modo concentración'),
        separator,
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'zoomIn', label: 'Ampliar' },
        { role: 'zoomOut', label: 'Reducir' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        separator,
        command('window:reload', 'Recargar ventana'),
        ...(options.developmentMode
          ? [
              {
                role: 'toggleDevTools',
                label: 'Herramientas de desarrollo',
              } as const,
            ]
          : []),
      ],
    },
    {
      label: 'Navegar',
      submenu: [
        command('core:toggle-telescope', 'Buscar en la paleta…'),
        command('core:telescope-notebooks', 'Ir a un notebook…'),
        command('core:telescope-tags', 'Ir a una etiqueta…'),
        command('telescope-toc:show', 'Ir a una sección de la nota…'),
        separator,
        command('core:navigate-back', 'Volver'),
        command('core:navigate-forward', 'Avanzar'),
        command('core:open-prev-note', 'Nota anterior'),
        command('core:open-next-note', 'Nota siguiente'),
      ],
    },
    { role: 'windowMenu', label: 'Ventana' },
    {
      role: 'help',
      label: 'Ayuda',
      submenu: [
        ...(mac ? [] : [updates, separator]),
        {
          label: `${options.appName} en GitHub`,
          click: () => options.openProject(),
        },
      ],
    },
  ];
}
