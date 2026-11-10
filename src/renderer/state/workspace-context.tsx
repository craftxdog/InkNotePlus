import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';

import type { WorkspaceStoreApi } from './workspace-store';
import type { WorkspaceStore } from './workspace-types';

const WorkspaceContext = createContext<WorkspaceStoreApi | null>(null);

export function WorkspaceProvider({
  store,
  children,
}: {
  store: WorkspaceStoreApi;
  children: ReactNode;
}) {
  return <WorkspaceContext value={store}>{children}</WorkspaceContext>;
}

export function useWorkspaceStore() {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error('WorkspaceProvider is missing.');
  return store;
}

export function useWorkspace<T>(selector: (state: WorkspaceStore) => T): T {
  return useStore(useWorkspaceStore(), selector);
}
