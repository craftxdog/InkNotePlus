import { app, BrowserWindow, ipcMain, session } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { Configuration } from './application/config';
import { coreConfigDefinitions } from './application/core-config';
import { CommandRegistry } from './application/command-registry';
import type { Disposable } from './application/disposable';
import { ModuleRegistry } from './application/module-registry';
import { registerNoteCommands } from './application/note-commands';
import { openDatabase } from './infrastructure/sqlite/database';
import { JsonConfigStorage } from './infrastructure/config/json-config-storage';
import { SqliteNoteRepository } from './infrastructure/sqlite/sqlite-note-repository';
import { SqliteSyncOutbox } from './infrastructure/sqlite/sqlite-sync-outbox';
import { registerNoteIpcHandlers } from './main/ipc/note-handlers';
import { createContentSecurityPolicy } from './main/security';
import { getConfigPath, getDatabasePath } from './main/storage';
import { createMainWindowOptions } from './main/window-options';
import { IPC_CHANNELS } from './shared/ipc';

if (started) {
  app.quit();
}

app.enableSandbox();

const isDevelopment = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
let database: DatabaseSync | null = null;
let mainWindow: BrowserWindow | null = null;
let noteCommands: Disposable | null = null;
let noteIpcHandlers: Disposable | null = null;
let coreModules: ModuleRegistry | null = null;
let configuration: Configuration | null = null;

function installSessionSecurity() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          createContentSecurityPolicy(
            isDevelopment,
            MAIN_WINDOW_VITE_DEV_SERVER_URL,
          ),
        ],
      },
    });
  });

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
}

function createWindow(activeConfiguration: Configuration): BrowserWindow {
  const window = new BrowserWindow(
    createMainWindowOptions({
      configuration: activeConfiguration,
      isDevelopment,
      preloadPath: path.join(__dirname, 'preload.cjs'),
    }),
  );

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return window;
}

function initializeCoreModules(): Configuration {
  const modules = new ModuleRegistry();

  modules.register({
    id: 'core.config',
    activate: () => {
      configuration = new Configuration(
        new JsonConfigStorage(getConfigPath(app.getPath('userData'))),
      );
      for (const definition of coreConfigDefinitions) {
        configuration.register(definition);
      }
    },
    deactivate: () => {
      configuration = null;
    },
  });
  modules.register({
    id: 'core.notes',
    activate: () => {
      const localDatabase = openDatabase(
        getDatabasePath(app.getPath('userData')),
      );
      let commandRegistration: Disposable | null = null;
      let ipcRegistration: Disposable | null = null;
      try {
        const syncOutbox = new SqliteSyncOutbox(localDatabase);
        const repository = new SqliteNoteRepository(localDatabase, syncOutbox);
        const commands = new CommandRegistry();
        commandRegistration = registerNoteCommands(commands, repository);
        ipcRegistration = registerNoteIpcHandlers({
          ipc: ipcMain,
          commands,
          getMainWebContents: () => mainWindow?.webContents ?? null,
          publishNoteChanged: (event) => {
            const webContents = mainWindow?.webContents;
            if (webContents && !webContents.isDestroyed()) {
              webContents.send(IPC_CHANNELS.events.noteChanged, event);
            }
          },
        });

        database = localDatabase;
        noteCommands = commandRegistration;
        noteIpcHandlers = ipcRegistration;
      } catch (error) {
        ipcRegistration?.dispose();
        commandRegistration?.dispose();
        localDatabase.close();
        throw error;
      }
    },
    deactivate: () => {
      noteIpcHandlers?.dispose();
      noteIpcHandlers = null;
      noteCommands?.dispose();
      noteCommands = null;
      database?.close();
      database = null;
    },
  });
  modules.activateAll();
  coreModules = modules;

  if (!configuration) {
    throw new Error('Core configuration did not activate.');
  }

  return configuration;
}

app.whenReady().then(() => {
  installSessionSecurity();
  const activeConfiguration = initializeCoreModules();
  mainWindow = createWindow(activeConfiguration);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && configuration) {
      mainWindow = createWindow(configuration);
    }
  });
});

app.on('before-quit', () => {
  coreModules?.deactivateAll();
  coreModules = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
