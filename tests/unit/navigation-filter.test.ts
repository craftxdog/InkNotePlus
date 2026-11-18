import { describe, expect, it } from 'vitest';
import {
  matchesNavigation,
  navigationFilter,
} from '../../src/renderer/state/library-actions';
import { defaultNoteMetadata } from '../../src/shared/note-metadata';
import { defaultPreferences } from '../../src/shared/preferences';
import type { Navigation } from '../../src/renderer/state/workspace-types';

const browsing: Navigation[] = [{ type: 'all' }, { type: 'tag', name: 'work' }];
const note = (status: 'active' | 'completed' | 'dropped') => ({
  ...defaultNoteMetadata,
  status,
  tags: ['work'],
});

describe.each(browsing)('browsing $type', (navigation) => {
  it('requests only unfinished notes', () => {
    expect(navigationFilter(navigation).excludeFinished).toBe(true);
  });
  it('keeps a draft visible only while it is unfinished', () => {
    const matches = (status: 'active' | 'completed' | 'dropped') =>
      matchesNavigation(note(status), navigation, defaultPreferences, []);
    expect(matches('active')).toBe(true);
    expect(matches('completed')).toBe(false);
    expect(matches('dropped')).toBe(false);
  });
});

it('still lists finished notes under their own status', () => {
  const navigation: Navigation = { type: 'status', status: 'completed' };
  expect(navigationFilter(navigation).excludeFinished).toBeUndefined();
  expect(
    matchesNavigation(note('completed'), navigation, defaultPreferences, []),
  ).toBe(true);
});
