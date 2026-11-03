import { describe, expect, it } from 'vitest';

import {
  Configuration,
  type ConfigStorage,
} from '../../src/application/config';
import {
  coreConfig,
  coreConfigDefinitions,
} from '../../src/application/core-config';
import { createMainWindowOptions } from '../../src/main/window-options';

class MemoryConfigStorage implements ConfigStorage {
  read(): Record<string, unknown> {
    return {};
  }

  write(): void {}
}

function createConfiguration(): Configuration {
  const config = new Configuration(new MemoryConfigStorage());
  for (const definition of coreConfigDefinitions) {
    config.register(definition);
  }

  return config;
}

describe('main window options', () => {
  it('creates a resizable, secure blank canvas with responsive dimensions', () => {
    const options = createMainWindowOptions({
      configuration: createConfiguration(),
      isDevelopment: false,
      preloadPath: '/app/preload.cjs',
    });

    expect(options).toMatchObject({
      height: 800,
      minHeight: 480,
      minWidth: 640,
      resizable: true,
      show: false,
      width: 1_280,
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        devTools: false,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        preload: '/app/preload.cjs',
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    });
  });

  it('clamps configured initial dimensions to their safe minimums', () => {
    const configuration = createConfiguration();
    configuration.set(coreConfig.window.minimumWidth, 700);
    configuration.set(coreConfig.window.minimumHeight, 520);
    configuration.set(coreConfig.window.initialWidth, 640);
    configuration.set(coreConfig.window.initialHeight, 480);

    const options = createMainWindowOptions({
      configuration,
      isDevelopment: true,
      preloadPath: '/app/preload.cjs',
    });

    expect(options.width).toBe(700);
    expect(options.height).toBe(520);
    expect(options.webPreferences?.devTools).toBe(true);
  });
});
