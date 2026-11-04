// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeManager } from '../../src/renderer/themes/theme-manager';
import type { ThemePackage } from '../../src/renderer/themes/catalog';

let manager: ThemeManager;
afterEach(() => manager?.dispose());
const theme = (name: string): ThemePackage => ({
  manifest: {
    name,
    version: '1.0.0',
    theme: true,
    themeAppearance: 'light',
    styleSheets: ['ui.css', 'syntax.css'],
  },
  label: name,
  source: 'builtin',
  styles: [`/${name}/ui.css`, `/${name}/syntax.css`],
});
function links() {
  return [
    ...document.head.querySelectorAll<HTMLLinkElement>(
      'link[data-theme-package]',
    ),
  ];
}
describe('theme activation', () => {
  it('keeps the most recently requested theme when reselecting the active package', async () => {
    manager = new ThemeManager(document);
    const first = manager.activate(theme('first'));
    links().forEach((link) => link.dispatchEvent(new Event('load')));
    await first;
    const pending = manager.activate(theme('second'));
    const staleLinks = links().filter(
      (link) => link.dataset.themePackage === 'second',
    );
    expect(await manager.activate(theme('first'))).toBe(true);
    staleLinks.forEach((link) => link.dispatchEvent(new Event('load')));
    expect(await pending).toBe(false);
    expect(manager.getActiveThemeNames()).toEqual(['first']);
    expect(manager.getLoadedThemeNames()).toEqual(['first']);
    expect(manager.getEnabledThemeNames()).toEqual(['first']);
    expect(links()).toHaveLength(2);
  });
  it('publishes only after every sheet loads, preserving the active package on failure', async () => {
    manager = new ThemeManager(document);
    const changed = vi.fn();
    manager.onDidChangeActiveThemes(changed);
    const first = manager.activate(theme('first'));
    links()[0].dispatchEvent(new Event('load'));
    expect(changed).not.toHaveBeenCalled();
    links()[1].dispatchEvent(new Event('load'));
    expect(await first).toBe(true);
    expect(manager.getActiveThemeNames()).toEqual(['first']);
    const second = manager.activate(theme('second'));
    expect(links().filter((link) => link.media === 'all')).toHaveLength(2);
    links()
      .find((link) => link.dataset.themePackage === 'second')!
      .dispatchEvent(new Event('error'));
    expect(await second).toBe(false);
    expect(manager.getActiveThemeNames()).toEqual(['first']);
    expect(links()).toHaveLength(2);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it('cancels incomplete packages when a newer activation starts', async () => {
    manager = new ThemeManager(document);
    const stale = manager.activate(theme('stale'));
    const latest = manager.activate(theme('latest'));
    links().forEach((link) => link.dispatchEvent(new Event('load')));
    expect(await stale).toBe(false);
    expect(await latest).toBe(true);
    expect(manager.getActiveThemeNames()).toEqual(['latest']);
  });
});
