/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
/// <reference types="vite/client" />

import type { InkNoteApi } from './preload/api';

declare global {
  interface Window {
    inkNote: InkNoteApi;
  }
}
