import { useEffect } from 'react';
import { useWorkspace } from '../state/workspace-context';
import { themeCatalog } from './catalog';

export function ThemeStyles() {
  const theme = useWorkspace((state) => state.preferences.theme);
  const { manifest, assets } = themeCatalog[theme];
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <>
      {manifest.styleSheets.map((file) => (
        <link
          key={`${theme}/${file}`}
          rel="stylesheet"
          href={assets[file as keyof typeof assets] || undefined}
          data-theme-package={theme}
          data-theme-area={file.replace('.css', '')}
        />
      ))}
    </>
  );
}
