import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { contextMenuTemplate } from '../../src/main/context-menu';

const params = (overrides: Partial<ContextMenuParams> = {}) =>
  ({
    x: 10,
    y: 20,
    isEditable: false,
    selectionText: '',
    misspelledWord: '',
    dictionarySuggestions: [],
    editFlags: { canCut: true, canCopy: true, canPaste: true },
    ...overrides,
  }) as ContextMenuParams;
function build(
  overrides: Partial<ContextMenuParams> = {},
  developmentMode = false,
) {
  const actions = {
    replaceMisspelling: vi.fn(),
    addToDictionary: vi.fn(),
    inspect: vi.fn(),
  };
  return {
    actions,
    template: contextMenuTemplate(params(overrides), actions, developmentMode),
  };
}
const labels = (template: MenuItemConstructorOptions[]) =>
  template.map((item) => (item.type === 'separator' ? '—' : item.label));
const click = (item: MenuItemConstructorOptions) =>
  (item.click as unknown as () => void)();

describe('context menu', () => {
  it('offers spelling suggestions first and applies the chosen one', () => {
    const { template, actions } = build({
      isEditable: true,
      misspelledWord: 'ola',
      dictionarySuggestions: ['hola', 'ala'],
    });
    expect(labels(template)).toEqual([
      'hola',
      'ala',
      '—',
      'Añadir «ola» al diccionario',
      '—',
      'Cortar',
      'Copiar',
      'Pegar',
    ]);
    click(template[0]);
    expect(actions.replaceMisspelling).toHaveBeenCalledWith('hola');
    click(template[3]);
    expect(actions.addToDictionary).toHaveBeenCalledWith('ola');
  });
  it('limits the number of suggestions', () => {
    const { template } = build({
      isEditable: true,
      misspelledWord: 'x',
      dictionarySuggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(labels(template).slice(0, 6)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      '—',
    ]);
  });
  it('says so when a misspelled word has no suggestions', () => {
    const { template } = build({ isEditable: true, misspelledWord: 'zzxq' });
    expect(template[0]).toMatchObject({
      label: 'Sin sugerencias',
      enabled: false,
    });
  });
  it('uses native editing roles and respects what is available', () => {
    const { template } = build({
      isEditable: true,
      editFlags: {
        canCut: false,
        canCopy: false,
        canPaste: true,
      } as ContextMenuParams['editFlags'],
    });
    expect(template.map(({ role, enabled }) => [role, enabled])).toEqual([
      ['cut', false],
      ['copy', false],
      ['paste', true],
    ]);
  });
  it('only offers copy for selected text outside editable fields', () => {
    const { template } = build({ selectionText: 'texto' });
    expect(labels(template)).toEqual(['Copiar']);
  });
  it('shows nothing when there is nothing to do', () => {
    expect(build({ selectionText: '   ' }).template).toEqual([]);
  });
  it('adds the inspector only in development mode', () => {
    expect(labels(build({ isEditable: true }).template)).not.toContain(
      'Inspeccionar elemento',
    );
    const { template, actions } = build({ isEditable: true }, true);
    expect(labels(template).slice(-2)).toEqual(['—', 'Inspeccionar elemento']);
    click(template.at(-1)!);
    expect(actions.inspect).toHaveBeenCalledWith(10, 20);
    expect(labels(build({}, true).template)).toEqual(['Inspeccionar elemento']);
  });
});
