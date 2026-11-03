/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import type { InkNoteApi } from './preload/api';

declare global {
  interface Window {
    inkNote: InkNoteApi;
  }
}
