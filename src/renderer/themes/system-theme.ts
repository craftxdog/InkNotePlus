import { useSyncExternalStore } from 'react';
import type { Preferences } from '../../shared/preferences';

export const activeThemeId = (
  preferences: Pick<
    Preferences,
    'theme' | 'followSystemTheme' | 'lightTheme' | 'darkTheme'
  >,
  systemDark: boolean,
) =>
  !preferences.followSystemTheme
    ? preferences.theme
    : systemDark
      ? preferences.darkTheme
      : preferences.lightTheme;

const darkQuery = '(prefers-color-scheme: dark)';

export function useSystemDark() {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia?.(darkQuery);
      query?.addEventListener('change', listener);
      return () => query?.removeEventListener('change', listener);
    },
    () => window.matchMedia?.(darkQuery).matches ?? false,
  );
}
