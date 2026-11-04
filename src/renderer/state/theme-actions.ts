import type { StoreApi } from 'zustand/vanilla';
import type { InkNoteApi } from '../../preload/api';
import type { WorkspaceStore } from './workspace-types';

export function createThemeActions(
  api: InkNoteApi,
  set: StoreApi<WorkspaceStore>['setState'],
  get: StoreApi<WorkspaceStore>['getState'],
) {
  let stylesQueue = Promise.resolve(true);
  let stylesRevision = 0;
  return {
    installedThemes: [],
    themesReady: false,
    customStyles: '',
    customStylesDraft: null,
    themeError: null,
    themeRevision: 0,
    browseThemes: api.themes.browse,
    async installTheme(name?: string) {
      const result = await (name
        ? api.themes.install(name)
        : api.themes.importFolder());
      if (result.ok) {
        set((state) => ({
          installedThemes: [
            ...state.installedThemes.filter(
              (theme) => theme.manifest.name !== result.data.manifest.name,
            ),
            result.data,
          ],
          themeError: null,
        }));
        await get().updatePreferences({ theme: result.data.manifest.name });
      } else if (result.error.code !== 'cancelled')
        set({ themeError: result.error.code });
    },
    async removeTheme(name: string) {
      const result = await api.themes.remove(name);
      if (result.ok) set({ installedThemes: result.data, themeError: null });
      else set({ themeError: result.error.code });
    },
    saveCustomStyles(css: string) {
      const revision = ++stylesRevision;
      stylesQueue = stylesQueue
        .then(async () => {
          const result = await api.themes.setCustomStyles(css);
          if (revision === stylesRevision) {
            if (result.ok)
              set({
                customStyles: result.data,
                themeError: null,
                ...(get().customStylesDraft === css
                  ? { customStylesDraft: null }
                  : {}),
              });
            else set({ themeError: result.error.code });
          }
          return result.ok;
        })
        .catch(() => {
          set({ themeError: 'unavailable' });
          return false;
        });
      return stylesQueue;
    },
    editCustomStyles(customStylesDraft: string) {
      set({ customStylesDraft });
    },
    flushThemeChanges: () =>
      get().customStylesDraft !== null
        ? get().saveCustomStyles(get().customStylesDraft!)
        : stylesQueue,
    themeDidLoad() {
      set((state) => ({
        themeRevision: state.themeRevision + 1,
        themeError: null,
      }));
    },
    themeDidFail() {
      set({ themeError: 'load_failed' });
    },
  };
}
