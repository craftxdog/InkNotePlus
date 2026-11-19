import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { appMenuTemplate, toAccelerator } from '../../src/main/app-menu';
import { resolveShortcutCommand } from '../../src/shared/keybindings';

type Item = MenuItemConstructorOptions;
function menu(overrides: Partial<Parameters<typeof appMenuTemplate>[0]> = {}) {
  const sendCommand = vi.fn();
  const checkForUpdates = vi.fn();
  const openProject = vi.fn();
  const template = appMenuTemplate({
    platform: 'darwin',
    appName: 'InkNote',
    keybindings: [],
    developmentMode: false,
    sendCommand,
    checkForUpdates,
    openProject,
    ...overrides,
  });
  const flat = (items: Item[]): Item[] =>
    items.flatMap((item) => [
      item,
      ...(Array.isArray(item.submenu) ? flat(item.submenu as Item[]) : []),
    ]);
  const find = (label: string) =>
    flat(template).find((item) => item.label === label);
  return {
    template,
    flat: flat(template),
    find,
    sendCommand,
    checkForUpdates,
    openProject,
  };
}
const click = (item: Item | undefined) =>
  (item!.click as unknown as () => void)();

describe('accelerators', () => {
  it.each([
    ['Mod-n', 'CmdOrCtrl+N'],
    ['Mod-Shift-d', 'CmdOrCtrl+Shift+D'],
    ['Mod-Alt-Shift-f', 'CmdOrCtrl+Alt+Shift+F'],
    ['Meta-ArrowLeft', 'Cmd+Left'],
    ['Alt-ArrowRight', 'Alt+Right'],
    ['Mod-,', 'CmdOrCtrl+,'],
    ['Mod-/', 'CmdOrCtrl+/'],
    ['Mod-Shift-[', 'CmdOrCtrl+Shift+['],
    ['F5', 'F5'],
    ['Mod-Enter', 'CmdOrCtrl+Return'],
  ])('converts %s', (keystroke, expected) => {
    expect(toAccelerator(keystroke)).toBe(expected);
  });
  it('leaves out empty and multi-stroke shortcuts', () => {
    expect(toAccelerator('')).toBeUndefined();
    expect(toAccelerator('Mod-k Mod-b')).toBeUndefined();
  });
});

describe('application menu', () => {
  it('groups commands in the expected menus', () => {
    expect(menu().template.map(({ label, role }) => label ?? role)).toEqual([
      'InkNote',
      'Archivo',
      'Edición',
      'Vista',
      'Navegar',
      'Ventana',
      'Ayuda',
    ]);
    expect(
      menu({ platform: 'win32' }).template.map(({ label }) => label),
    ).not.toContain('InkNote');
  });
  it('sends only commands the renderer recognizes', () => {
    const { flat, sendCommand } = menu();
    const commands = flat.filter((item) => item.id);
    expect(commands.length).toBeGreaterThan(20);
    for (const item of commands) {
      expect(resolveShortcutCommand(item.id)).toBe(item.id);
      click(item);
      expect(sendCommand).toHaveBeenLastCalledWith(item.id);
    }
  });
  it('keeps native editing roles so the clipboard works', () => {
    const roles = menu().flat.map(({ role }) => role);
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])
      expect(roles).toContain(role);
  });
  it('shows the current shortcut, including customized ones', () => {
    expect(menu().find('Nueva nota')?.accelerator).toBe('CmdOrCtrl+N');
    expect(
      menu({
        keybindings: [{ command: 'core:new-note', keystroke: 'Mod-Shift-y' }],
      }).find('Nueva nota')?.accelerator,
    ).toBe('CmdOrCtrl+Shift+Y');
    expect(
      menu({ keybindings: [{ command: 'core:new-note', keystroke: '' }] }).find(
        'Nueva nota',
      )?.accelerator,
    ).toBeUndefined();
  });
  it('uses the shortcut of each platform', () => {
    // On macOS Cmd+Left must keep moving the caret in text fields.
    expect(menu().find('Volver')?.accelerator).toBeUndefined();
    expect(menu({ platform: 'linux' }).find('Volver')?.accelerator).toBe(
      'Alt+Left',
    );
  });
  it('lets the renderer handle shortcuts on Windows and Linux', () => {
    expect(
      menu({ platform: 'win32' }).find('Nueva nota')?.registerAccelerator,
    ).toBe(false);
  });
  it('hides developer tools outside development mode', () => {
    expect(menu().flat.some(({ role }) => role === 'toggleDevTools')).toBe(
      false,
    );
    expect(
      menu({ developmentMode: true }).flat.some(
        ({ role }) => role === 'toggleDevTools',
      ),
    ).toBe(true);
  });
  it('checks for updates from the help menu', () => {
    const { flat, checkForUpdates } = menu({ platform: 'linux' });
    click(flat.find(({ label }) => label === 'Buscar actualizaciones…'));
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
