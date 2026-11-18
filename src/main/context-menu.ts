import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron';

interface ContextMenuActions {
  replaceMisspelling(word: string): void;
  addToDictionary(word: string): void;
  inspect(x: number, y: number): void;
}

const separator: MenuItemConstructorOptions = { type: 'separator' };

export function contextMenuTemplate(
  params: ContextMenuParams,
  actions: ContextMenuActions,
  developmentMode: boolean,
): MenuItemConstructorOptions[] {
  const word = params.misspelledWord;
  const suggestions = params.dictionarySuggestions.slice(0, 5);
  const spelling: MenuItemConstructorOptions[] = word
    ? [
        ...(suggestions.length
          ? suggestions.map((suggestion) => ({
              label: suggestion,
              click: () => actions.replaceMisspelling(suggestion),
            }))
          : [{ label: 'Sin sugerencias', enabled: false }]),
        separator,
        {
          label: `Añadir «${word}» al diccionario`,
          click: () => actions.addToDictionary(word),
        },
      ]
    : [];
  const { canCut, canCopy, canPaste } = params.editFlags;
  const editing: MenuItemConstructorOptions[] = params.isEditable
    ? [
        { role: 'cut', label: 'Cortar', enabled: canCut },
        { role: 'copy', label: 'Copiar', enabled: canCopy },
        { role: 'paste', label: 'Pegar', enabled: canPaste },
      ]
    : params.selectionText.trim()
      ? [{ role: 'copy', label: 'Copiar', enabled: canCopy }]
      : [];
  const development: MenuItemConstructorOptions[] = developmentMode
    ? [
        {
          label: 'Inspeccionar elemento',
          click: () => actions.inspect(params.x, params.y),
        },
      ]
    : [];
  return [spelling, editing, development]
    .filter((group) => group.length)
    .flatMap((group, index) => (index ? [separator, ...group] : group));
}
