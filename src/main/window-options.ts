import type { BrowserWindowConstructorOptions } from 'electron';

import type { Configuration } from '../application/config';
import { coreConfig } from '../application/core-config';

export interface CreateMainWindowOptionsInput {
  readonly configuration: Configuration;
  readonly isDevelopment: boolean;
  readonly preloadPath: string;
  readonly iconPath: string;
}

export function createMainWindowOptions({
  configuration,
  isDevelopment,
  preloadPath,
  iconPath,
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
    icon: iconPath,
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 16 },
        }
      : {}),
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
      devTools:
        isDevelopment ||
        configuration.get(coreConfig.appearance).developmentMode,
    },
  };
}
