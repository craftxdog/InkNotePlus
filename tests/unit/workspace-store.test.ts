import { beforeEach, describe, expect, it } from 'vitest';

import {
  initialWorkspaceState,
  useWorkspaceStore,
} from '../../src/renderer/state/workspace-store';

describe('workspace store', () => {
  beforeEach(() => {
    useWorkspaceStore.setState(initialWorkspaceState);
  });

  it('tracks an active note independently from the search query', () => {
    const store = useWorkspaceStore.getState();

    store.selectNote('note-1');
    store.setSearchQuery('architecture');

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeNoteId: 'note-1',
      searchQuery: 'architecture',
    });
  });

  it('clears selection without clearing the current query', () => {
    const store = useWorkspaceStore.getState();

    store.setSearchQuery('inbox');
    store.selectNote(null);

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeNoteId: null,
      searchQuery: 'inbox',
    });
  });
});
