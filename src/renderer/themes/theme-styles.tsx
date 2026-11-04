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
  const loaded = useWorkspace((state) => state.themeDidLoad);
  const failed = useWorkspace((state) => state.themeDidFail);
  const [manager] = useState(() => new ThemeManager(document));
  useEffect(() => () => manager.dispose(), [manager]);
  useEffect(() => {
    const subscription = manager.onDidChangeActiveThemes(loaded);
    return () => subscription.dispose();
  }, [manager, loaded]);
  useEffect(() => {
    const theme =
      installed.find((value) => value.manifest.name === id) ?? themeCatalog[id];
    if (!theme && !ready) return;
    let active = true;
    void manager.activate(theme ?? themeCatalog['inknote-light']).then((ok) => {
      if (active && (!ok || !theme)) failed();
    });
    return () => {
      active = false;
    };
  }, [id, installed, ready, manager, failed]);
  return nonce && css ? (
    <style nonce={nonce} data-user-styles>
      {css}
    </style>
  ) : null;
}
