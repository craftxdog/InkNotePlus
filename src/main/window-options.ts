import type { BrowserWindowConstructorOptions } from 'electron';

import type { Configuration } from '../application/config';
import { coreConfig } from '../application/core-config';

export interface CreateMainWindowOptionsInput {
  readonly configuration: Configuration;
  readonly isDevelopment: boolean;
  readonly preloadPath: string;
}

export function createMainWindowOptions({
  configuration,
  isDevelopment,
  preloadPath,
}: CreateMainWindowOptionsInput): BrowserWindowConstructorOptions {
  const minWidth = configuration.get(coreConfig.window.minimumWidth);
  const minHeight = configuration.get(coreConfig.window.minimumHeight);

  return {
    width: Math.max(
      configuration.get(coreConfig.window.initialWidth),
      minWidth,
    ),
    height: Math.max(
      configuration.get(coreConfig.window.initialHeight),
      minHeight,
    ),
    minWidth,
    minHeight,
    resizable: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: isDevelopment,
    },
  };
}
