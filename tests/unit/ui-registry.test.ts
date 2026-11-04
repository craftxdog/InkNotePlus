import { describe, expect, it } from 'vitest';
import { UiRegistry } from '../../src/renderer/extensions/ui-registry';
describe('trusted React layout contributions', () => {
  it('registers components, rejects duplicates and disposes only the owning module', () => {
    const registry = new UiRegistry();
    const View = () => null;
    const component = registry.registerClass(
      'example.plugin',
      'ExamplePanel',
      View,
    );
    const placement = registry.addComponentToLayout(
      'example.plugin',
      'sidebar-menu',
      'ExamplePanel',
    );
    expect(registry.getLayout('sidebar-menu')[0].component).toBe(View);
    expect(() =>
      registry.registerClass('other.plugin', 'ExamplePanel', View),
    ).toThrow();
    expect(() =>
      registry.addComponentToLayout(
        'other.plugin',
        'editor-header',
        'ExamplePanel',
      ),
    ).toThrow();
    registry.deleteClass('other.plugin', 'ExamplePanel');
    expect(registry.getComponentClass('ExamplePanel')).toBe(View);
    registry.disposeOwner('example.plugin');
    expect(registry.getLayout('sidebar-menu')).toEqual([]);
    const next = registry.registerClass('example.plugin', 'ExamplePanel', View);
    component.dispose();
    placement.dispose();
    expect(registry.getComponentClass('ExamplePanel')).toBe(View);
    next.dispose();
    expect(registry.getComponentClass('ExamplePanel')).toBeUndefined();
  });
});
