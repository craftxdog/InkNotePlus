import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './renderer/app';
import { noteWindowTarget } from './renderer/state/note-window';
import { createWorkspaceStore } from './renderer/state/workspace-store';
import {
  readWorkspaceSession,
  writeWorkspaceSession,
} from './renderer/state/workspace-session';

const container = document.getElementById('root');
if (!container) throw new Error('InkNote root element is missing.');

const noteWindow = noteWindowTarget(location.search);
const store = createWorkspaceStore(
  window.inkNote,
  noteWindow ? undefined : readWorkspaceSession(sessionStorage),
  noteWindow,
);
const stopSession = store.subscribe((state, previous) => {
  if (
    !noteWindow &&
    (state.activeNoteId !== previous.activeNoteId ||
      state.navigation !== previous.navigation ||
      state.searchQuery !== previous.searchQuery ||
      state.searchGlobal !== previous.searchGlobal ||
      state.mainLayout !== previous.mainLayout ||
      state.noteHistory !== previous.noteHistory ||
      state.noteList.status !== previous.noteList.status)
  )
    writeWorkspaceSession(sessionStorage, state);
});
const root = createRoot(container);
root.render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);

window.addEventListener('beforeunload', (event) => {
  const state = store.getState();
  if (!noteWindow) writeWorkspaceSession(sessionStorage, state);
  if (
    state.document.isDirty ||
    state.noteList.isSaving ||
    Object.values(state.parkedDrafts).some((draft) => draft.isDirty) ||
    state.customStylesDraft !== null
  ) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener(
  'pagehide',
  () => {
    if (!noteWindow) writeWorkspaceSession(sessionStorage, store.getState());
    stopSession();
    root.unmount();
  },
  { once: true },
);
