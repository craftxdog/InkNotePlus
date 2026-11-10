import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  shell,
  protocol,
  dialog,
  nativeImage,
  Menu,
} from 'electron';
import { registerExternalLinkHandler } from './main/ipc/external-link-handler';
import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import started from 'electron-squirrel-startup';
import { installCloseGuard } from './main/close-guard';

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
import { registerPreferencesHandlers } from './main/ipc/preferences-handlers';
import { registerLibraryHandlers } from './main/ipc/library-handlers';
import { SqliteLibraryRepository } from './infrastructure/sqlite/sqlite-library-repository';
import { createContentSecurityPolicy } from './main/security';
import { getConfigPath, getDatabasePath } from './main/storage';
import { createMainWindowOptions } from './main/window-options';
import { configureAppIcon, getAppIconPath } from './main/app-icon';
import { IPC_CHANNELS } from './shared/ipc';
import { coreConfig } from './application/core-config';
import { ThemeService } from './main/themes/theme-service';
import { ThemeRegistry } from './main/themes/theme-registry';
import { downloadThemeResource } from './main/themes/download';
import { registerThemeHandlers } from './main/ipc/theme-handlers';
import { readAsset } from './main/asset-protocol';
import { registerImageHandlers } from './main/ipc/image-handlers';
import { registerTransferHandlers } from './main/ipc/transfer-handlers';
import { BackupFiles } from './main/backup-files';
import { BackupService } from './main/backup-service';
import { SqliteLibraryTransfer } from './infrastructure/sqlite/sqlite-library-transfer';
import { TRANSFER_CHANNELS } from './shared/transfer';
import { pruneNotebookPreferences } from './shared/preferences';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'inknote-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

if (started) {
  app.quit();
}

app.enableSandbox();

const isDevelopment = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
const styleNonce = randomBytes(24).toString('base64');
let database: DatabaseSync | null = null;
let mainWindow: BrowserWindow | null = null;
let noteCommands: Disposable | null = null;
let noteIpcHandlers: Disposable | null = null;
let appearanceHandlers: Disposable | null = null;
let themeHandlers: Disposable | null = null;
let imageHandlers: Disposable | null = null;
let externalLinkHandler: Disposable | null = null;
let libraryHandlers: Disposable | null = null;
let transferHandlers: Disposable | null = null;
let backup: BackupService | null = null;
let coreModules: ModuleRegistry | null = null;
let configuration: Configuration | null = null;
let quitting = false;
let drainingBackup = false;

function installSessionSecurity() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          createContentSecurityPolicy(
            isDevelopment,
            MAIN_WINDOW_VITE_DEV_SERVER_URL,
            styleNonce,
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
      iconPath: getAppIconPath(),
    }),
  );

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('context-menu', (_event, params) => {
    if (!activeConfiguration.get(coreConfig.appearance).developmentMode) return;
    Menu.buildFromTemplate([
      {
        label: 'Inspeccionar elemento',
        click: () => window.webContents.inspectElement(params.x, params.y),
      },
    ]).popup({ window });
  });
  installCloseGuard(window, ipcMain);
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
    id: 'core.appearance',
    activate() {
      if (!configuration) throw new Error('Configuration is not active.');
      appearanceHandlers = registerPreferencesHandlers({
        ipc: ipcMain,
        configuration,
        getMainWebContents: () => mainWindow?.webContents ?? null,
        styleNonce,
        platform: process.platform,
      });
    },
    deactivate() {
      appearanceHandlers?.dispose();
      appearanceHandlers = null;
    },
  });
  modules.register({
    id: 'core.themes',
    activate() {
      const service = new ThemeService(app.getPath('userData'));
      themeHandlers = registerThemeHandlers({
        ipc: ipcMain,
        service,
        registry: new ThemeRegistry((url, max) =>
          downloadThemeResource(fetch, url, max),
        ),
        getMainWebContents: () => mainWindow?.webContents ?? null,
        isActive: (name) =>
          configuration?.get(coreConfig.appearance).theme === name,
        async chooseFolder() {
          if (!mainWindow) return;
          const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Importar tema de Inkdrop 6',
            properties: ['openDirectory'],
          });
          return result.canceled ? undefined : result.filePaths[0];
        },
      });
    },
    deactivate() {
      themeHandlers?.dispose();
      themeHandlers = null;
    },
  });
  modules.register({
    id: 'core.images',
    activate() {
      imageHandlers = registerImageHandlers({
        ipc: ipcMain,
        userData: app.getPath('userData'),
        getMainWebContents: () => mainWindow?.webContents ?? null,
        isDecodable: (bytes) => !nativeImage.createFromBuffer(bytes).isEmpty(),
        async chooseFile() {
          if (!mainWindow) return;
          const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Insertar imagen',
            properties: ['openFile'],
            filters: [
              {
                name: 'Imágenes',
                extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
              },
            ],
          });
          return result.canceled ? undefined : result.filePaths[0];
        },
      });
    },
    deactivate() {
      imageHandlers?.dispose();
      imageHandlers = null;
    },
  });
  modules.register({
    id: 'core.links',
    activate() {
      externalLinkHandler = registerExternalLinkHandler({
        ipc: ipcMain,
        getMainWebContents: () => mainWindow?.webContents ?? null,
        openExternal: (url) => shell.openExternal(url),
      });
    },
    deactivate() {
      externalLinkHandler?.dispose();
      externalLinkHandler = null;
    },
  });
  modules.register({
    id: 'core.notes',
    activate: () => {
      const activeConfig = configuration;
      if (!activeConfig) throw new Error('Configuration is not active.');
      const localDatabase = openDatabase(
        getDatabasePath(app.getPath('userData')),
      );
      let commandRegistration: Disposable | null = null;
      let ipcRegistration: Disposable | null = null;
      try {
        const syncOutbox = new SqliteSyncOutbox(localDatabase);
        const repository = new SqliteNoteRepository(localDatabase, syncOutbox);
        const userData = app.getPath('userData');
        const library = new SqliteLibraryTransfer(localDatabase, repository);
        const prunePreferences = (missing: (id: string) => boolean) => {
          const preferences = activeConfig.get(coreConfig.appearance);
          const patch = pruneNotebookPreferences(preferences, missing);
          if (!Object.keys(patch).length) return;
          try {
            activeConfig.set(coreConfig.appearance, {
              ...preferences,
              ...patch,
            });
          } catch {
            console.warn('InkNote could not save notebook preferences.');
          }
        };
        const notebookIds = new Set(
          library.listNotebooks().map(({ id }) => id),
        );
        prunePreferences((id) => !notebookIds.has(id));
        backup = new BackupService({
          files: new BackupFiles(library, userData, syncOutbox.getDeviceId()),
          directory: activeConfig.get(coreConfig.backupDirectory),
          saveDirectory: (directory) =>
            activeConfig.set(coreConfig.backupDirectory, directory),
          onStatus: (status) => {
            if (mainWindow && !mainWindow.isDestroyed())
              mainWindow.webContents.send(
                TRANSFER_CHANNELS.backupChanged,
                status,
              );
          },
        });
        const commands = new CommandRegistry();
        commandRegistration = registerNoteCommands(commands, repository);
        ipcRegistration = registerNoteIpcHandlers({
          ipc: ipcMain,
          commands,
          getMainWebContents: () => mainWindow?.webContents ?? null,
          onTrashChanged: () => backup?.schedule(),
          publishNoteChanged: (event) => {
            backup?.schedule();
            const webContents = mainWindow?.webContents;
            if (webContents && !webContents.isDestroyed()) {
              webContents.send(IPC_CHANNELS.events.noteChanged, event);
            }
          },
        });

        libraryHandlers = registerLibraryHandlers({
          ipc: ipcMain,
          repository: new SqliteLibraryRepository(localDatabase, repository),
          getMainWebContents: () => mainWindow?.webContents ?? null,
          onLibraryChanged: () => backup?.schedule(),
          onNotebookDeleted: (ids) => {
            const deleted = new Set(ids);
            prunePreferences((id) => deleted.has(id));
          },
        });
        transferHandlers = registerTransferHandlers({
          ipc: ipcMain,
          getWindow: () => mainWindow,
          getPreferences: () => activeConfig.get(coreConfig.appearance),
          backup,
          library,
          userData,
        });
        database = localDatabase;
        noteCommands = commandRegistration;
        noteIpcHandlers = ipcRegistration;
      } catch (error) {
        transferHandlers?.dispose();
        transferHandlers = null;
        libraryHandlers?.dispose();
        libraryHandlers = null;
        backup?.dispose();
        backup = null;
        ipcRegistration?.dispose();
        commandRegistration?.dispose();
        localDatabase.close();
        throw error;
      }
    },
    deactivate: () => {
      transferHandlers?.dispose();
      transferHandlers = null;
      backup?.dispose();
      backup = null;
      libraryHandlers?.dispose();
      libraryHandlers = null;
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
  configureAppIcon();
  installSessionSecurity();
  protocol.handle('inknote-asset', (request) =>
    readAsset(request.url, app.getPath('userData')),
  );
  const activeConfiguration = initializeCoreModules();
  mainWindow = createWindow(activeConfiguration);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && configuration) {
      mainWindow = createWindow(configuration);
    }
  });
});

app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', (event) => {
  if (!drainingBackup && backup?.hasPendingWork) {
    event.preventDefault();
    drainingBackup = true;
    void backup.drain().finally(() => app.quit());
    return;
  }
  coreModules?.deactivateAll();
  coreModules = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || quitting) {
    app.quit();
  }
});
