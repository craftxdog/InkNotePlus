import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/app';
import { createWorkspaceStore } from './renderer/state/workspace-store';

const container = document.getElementById('root');
if (!container) throw new Error('InkNote root element is missing.');

const store = createWorkspaceStore(window.inkNote);
const root = createRoot(container);
root.render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);

window.addEventListener('beforeunload', () => root.unmount(), { once: true });
