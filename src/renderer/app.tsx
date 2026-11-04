import { useEffect, useState } from 'react';
import { WorkspaceProvider } from './state/workspace-context';
import type { WorkspaceStoreApi } from './state/workspace-store';
import { AppShell } from './components/app-shell';
import { ThemeStyles } from './themes/theme-styles';
import { installShortcuts } from './shortcuts';
import { UiRegistry } from './extensions/ui-registry';
import { UiProvider } from './extensions/ui-slots';
import { ChooseTemplateAction } from './components/choose-template-action';

export function App({ store }: { store: WorkspaceStoreApi }) {
  const [ui] = useState(() => {
    const registry = new UiRegistry();
    registry.registerClass(
      'core.templates',
      'ChooseTemplateAction',
      ChooseTemplateAction,
    );
    registry.addComponentToLayout(
      'core.templates',
      'editor-header',
      'ChooseTemplateAction',
    );
    return registry;
  });
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
      <UiProvider registry={ui}>
        <ThemeStyles />
        <AppShell />
      </UiProvider>
    </WorkspaceProvider>
  );
}
