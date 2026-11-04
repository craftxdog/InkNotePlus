import type { ThemePackage } from './catalog';

// A complete package replaces the current theme only after every sheet loads.
export class ThemeManager {
  private request = 0;
  private active: { theme: ThemePackage; links: HTMLLinkElement[] } | null =
    null;
  private pending: HTMLLinkElement[] = [];
  private cancel: (() => void) | undefined;
  private listeners = new Set<(theme: ThemePackage) => void>();
  private loaded = new Map<string, ThemePackage>();
  private enabled: string[] = [];
  constructor(private readonly document: Document) {}
  getActiveThemes() {
    return this.active ? [this.active.theme] : [];
  }
  getActiveThemeNames() {
    return this.getActiveThemes().map((theme) => theme.manifest.name);
  }
  getLoadedThemes() {
    return [...this.loaded.values()];
  }
  getLoadedThemeNames() {
    return [...this.loaded.keys()];
  }
  getEnabledThemeNames() {
    return [...this.enabled];
  }
  onDidChangeActiveThemes(callback: (theme: ThemePackage) => void) {
    this.listeners.add(callback);
    return {
      dispose: () => {
        this.listeners.delete(callback);
      },
    };
  }
  async activate(theme: ThemePackage): Promise<boolean> {
    this.enabled = [theme.manifest.name];
    this.cancel?.();
    this.cancel = undefined;
    this.pending.forEach((link) => link.remove());
    this.pending = [];
    const request = ++this.request;
    if (
      this.active?.theme.manifest.name === theme.manifest.name &&
      this.active.theme.styles.join() === theme.styles.join()
    )
      return true;
    const links = theme.styles.map((href, index) => {
      const link = this.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.media = 'not all';
      link.dataset.themePackage = theme.manifest.name;
      link.dataset.themeArea = theme.manifest.styleSheets[index].replace(
        '.css',
        '',
      );
      return link;
    });
    this.pending = links;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        let remaining = links.length;
        const fail = () =>
          reject(new Error('Theme stylesheet failed to load.'));
        this.cancel = fail;
        timer = setTimeout(fail, 15_000);
        if (!remaining) fail();
        for (const link of links) {
          link.onload = () => {
            if (--remaining === 0) resolve();
          };
          link.onerror = fail;
          this.document.head.append(link);
        }
      });
      if (request !== this.request) return false;
      for (const link of links) link.media = 'all';
      this.active?.links.forEach((link) => link.remove());
      this.active = { theme, links };
      this.loaded.set(theme.manifest.name, theme);
      this.document.documentElement.dataset.theme = theme.manifest.name;
      this.document.documentElement.style.colorScheme =
        theme.manifest.themeAppearance;
      for (const listener of this.listeners) listener(theme);
      return true;
    } catch {
      links.forEach((link) => link.remove());
      if (request === this.request) this.enabled = this.getActiveThemeNames();
      return false;
    } finally {
      clearTimeout(timer);
      for (const link of links) {
        link.onload = null;
        link.onerror = null;
      }
      if (request === this.request) {
        this.pending = [];
        this.cancel = undefined;
      }
    }
  }
  dispose() {
    this.request++;
    this.cancel?.();
    this.cancel = undefined;
    this.pending.forEach((link) => link.remove());
    this.pending = [];
    this.active?.links.forEach((link) => link.remove());
    this.active = null;
    this.listeners.clear();
    this.loaded.clear();
    this.enabled = [];
  }
}
