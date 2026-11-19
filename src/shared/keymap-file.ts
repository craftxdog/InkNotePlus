import { z } from './validation';
import { keystrokeSchema, resolveShortcutCommand } from './keybindings';

export const KEYMAP_CHANNELS = {
  get: 'keymap:get',
  open: 'keymap:open',
  changed: 'keymap:changed',
} as const;

const specialCommands = ['native!', 'unset!', 'abort!'] as const;
const maxEntries = 500;

export const keymapEntrySchema = z
  .object({
    selector: z.string().min(1).max(200),
    keystroke: z.string().min(1).max(80),
    command: z.string().min(1).max(100),
  })
  .strict();
export const keymapFileSchema = z
  .object({
    path: z.string().max(4096),
    entries: z.array(keymapEntrySchema).max(maxEntries),
    errors: z.array(z.string().max(300)).max(maxEntries),
  })
  .strict();
export type KeymapEntry = z.output<typeof keymapEntrySchema>;
export type KeymapFile = z.output<typeof keymapFileSchema>;
export const emptyKeymap: KeymapFile = { path: '', entries: [], errors: [] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function parseKeymap(text: string): Omit<KeymapFile, 'path'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { entries: [], errors: ['El archivo no contiene JSON válido.'] };
  }
  if (!isRecord(parsed))
    return {
      entries: [],
      errors: ['El archivo debe ser un objeto con selectores CSS.'],
    };
  const entries: KeymapEntry[] = [];
  const errors: string[] = [];
  for (const [selector, bindings] of Object.entries(parsed)) {
    if (!selector.trim() || selector.length > 200 || !isRecord(bindings)) {
      errors.push(`Selector no válido: ${selector.slice(0, 80)}`);
      continue;
    }
    for (const [keystroke, value] of Object.entries(bindings)) {
      const label = `${selector.slice(0, 80)} → ${keystroke.slice(0, 80)}`;
      if (!keystroke || !keystrokeSchema.safeParse(keystroke).success) {
        errors.push(`Atajo no válido: ${label}`);
        continue;
      }
      const command = (specialCommands as readonly unknown[]).includes(value)
        ? (value as string)
        : resolveShortcutCommand(value);
      if (!command) {
        errors.push(`Comando desconocido: ${label}`);
        continue;
      }
      if (entries.length < maxEntries)
        entries.push({ selector, keystroke, command });
    }
  }
  return { entries, errors: errors.slice(0, maxEntries) };
}
