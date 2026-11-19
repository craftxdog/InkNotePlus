import { describe, expect, it } from 'vitest';
import { activeThemeId } from '../../src/renderer/themes/system-theme';
import {
  defaultPreferences,
  preferencesSchema,
} from '../../src/shared/preferences';

const preferences = {
  ...defaultPreferences,
  theme: 'solarized-light',
  lightTheme: 'kanagawa-lotus',
  darkTheme: 'kanagawa-dragon',
};

describe('activeThemeId', () => {
  it('keeps the chosen theme by default', () => {
    expect(activeThemeId(preferences, true)).toBe('solarized-light');
  });

  it('follows the system appearance when enabled', () => {
    const auto = { ...preferences, followSystemTheme: true };
    expect(activeThemeId(auto, false)).toBe('kanagawa-lotus');
    expect(activeThemeId(auto, true)).toBe('kanagawa-dragon');
  });

  it('fills the new settings on existing profiles', () => {
    expect(preferencesSchema.parse({ theme: 'solarized-dark' })).toMatchObject({
      theme: 'solarized-dark',
      followSystemTheme: false,
      lightTheme: 'inknote-light',
      darkTheme: 'inknote-dark',
    });
  });
});
