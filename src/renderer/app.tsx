import { useEffect } from 'react';
import { WorkspaceProvider } from './state/workspace-context';
import type { WorkspaceStoreApi } from './state/workspace-store';
import { AppShell } from './components/app-shell';
import { ThemeStyles } from './themes/theme-styles';
import { installShortcuts } from './shortcuts';

export function App({ store }: { store: WorkspaceStoreApi }) {
  useEffect(() => {
    const blur = () => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    };
    const disconnect = store.getState().connect(blur);
    const stopShortcuts = installShortcuts(store);
    const flush = () => {
      void store.getState().flushDrafts();
    };
    window.addEventListener('blur', flush);
    return () => {
      window.removeEventListener('blur', flush);
      disconnect();
      stopShortcuts();
    };
  }, [store]);
  return (
    <WorkspaceProvider store={store}>
      <ThemeStyles />
      <AppShell />
    </WorkspaceProvider>
  );
}
