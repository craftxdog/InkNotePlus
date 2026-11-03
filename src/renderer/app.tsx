import { useEffect } from 'react';
import { WorkspaceProvider } from './state/workspace-context';
import type { WorkspaceStoreApi } from './state/workspace-store';
import { AppShell } from './components/app-shell';
import { ThemeStyles } from './themes/theme-styles';

export function App({ store }: { store: WorkspaceStoreApi }) {
  useEffect(() => store.getState().connect(), [store]);
  return (
    <WorkspaceProvider store={store}>
      <ThemeStyles />
      <AppShell />
    </WorkspaceProvider>
  );
}
