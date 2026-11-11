import { useEffect, useState } from 'react';
import { useWorkspace } from '../state/workspace-context';
import { themeCatalog } from './catalog';
import { ThemeManager } from './theme-manager';

export function ThemeStyles() {
  const id = useWorkspace((state) => state.preferences.theme);
  const installed = useWorkspace((state) => state.installedThemes);
  const ready = useWorkspace((state) => state.themesReady);
  const css = useWorkspace((state) => state.customStyles);
  const nonce = useWorkspace((state) => state.styleNonce);
  const preferencesError = useWorkspace((state) => state.preferencesError);
  const bootstrapFailed = !nonce && preferencesError;
  const loaded = useWorkspace((state) => state.themeDidLoad);
  const failed = useWorkspace((state) => state.themeDidFail);
  const setWindowBackground = useWorkspace(
    (state) => state.setWindowBackground,
  );
  const [manager] = useState(() => new ThemeManager(document));
  useEffect(() => () => manager.dispose(), [manager]);
  useEffect(() => {
    const subscription = manager.onDidChangeActiveThemes(() => {
      loaded();
      const color = getComputedStyle(document.documentElement).backgroundColor;
      const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
      if (channels) {
        const hex =
          '#' +
          channels
            .slice(1)
            .map((value) => Number(value).toString(16).padStart(2, '0'))
            .join('');
        void setWindowBackground(hex);
      }
    });
    return () => subscription.dispose();
  }, [manager, loaded, setWindowBackground]);
  useEffect(() => {
    if (!nonce && !bootstrapFailed) return;
    const theme = bootstrapFailed
      ? themeCatalog['inknote-light']
      : (installed.find((value) => value.manifest.name === id) ??
        themeCatalog[id]);
    if (!theme && !ready) return;
    let active = true;
    void manager
      .activate(theme ?? themeCatalog['inknote-light'], nonce ?? undefined)
      .then((ok) => {
        if (active && (!ok || !theme)) failed();
      });
    return () => {
      active = false;
    };
  }, [id, installed, ready, manager, failed, nonce, bootstrapFailed]);
  return nonce && css ? (
    <style nonce={nonce} data-user-styles>
      {css}
    </style>
  ) : null;
}
