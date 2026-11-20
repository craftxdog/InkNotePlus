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
  Tray,
  globalShortcut,
  safeStorage,
} from 'electron';
import { registerExternalLinkHandler } from './main/ipc/external-link-handler';
import { fetchPageTitle } from './main/link-title';
import { contextMenuTemplate } from './main/context-menu';
import { appMenuTemplate } from './main/app-menu';
import { createKeymapFile } from './main/keymap-file';
import { createPluginStore } from './main/plugins/plugin-store';
import { registerPluginHandlers } from './main/ipc/plugin-handlers';
import { pluginHostUrl } from './shared/plugins';
import { createDesktopIntegration } from './main/desktop-integration';
import { createSecretStore, type SecretEncryption } from './main/secret-store';
import { createCouchClient } from './main/sync/couch-client';
import { connectEncryption } from './main/sync/connection';
import { createSyncController, type StoredSync } from './main/sync/controller';
import { diagnoseConnection } from './main/sync/diagnostics';
import { runSync } from './main/sync/engine';
import { registerSyncHandlers } from './main/ipc/sync-handlers';
import { SqliteSyncStore } from './infrastructure/sqlite/sqlite-sync-store';
import { SYNC_CHANNELS } from './shared/sync';
import { createAiService } from './main/ai/service';
import { completeWithAnthropic } from './main/ai/anthropic-provider';
import { completeWithCompatibleApi } from './main/ai/compatible-provider';
import { fetchGithubSnippet } from './main/github-snippets';
import { registerAiHandlers } from './main/ipc/ai-handlers';
import {
  createLocalApiController,
  localApiUsername,
} from './main/local-api/controller';
import { createApiCredentials } from './main/local-api/credentials';
import { createLocalApiServer } from './main/local-api/http-server';
import { createNotesBackend } from './main/local-api/notes-backend';
import { scopeNotesBackend } from './main/local-api/notes-scope';
import { readClippedPage } from './main/note-import';
import { storeImage } from './main/image-store';
import { registerLocalApiHandlers } from './main/ipc/local-api-handlers';
import { LOCAL_API_CHANNELS } from './shared/local-api';
import { randomBytes } from 'node:crypto';
import { registerKeymapHandlers } from './main/ipc/keymap-handlers';
import { KEYMAP_CHANNELS } from './shared/keymap-file';
import { createUpdateChecker } from './main/app-updates';
import { createNoteLinkRouter, noteLinkFromArgv } from './main/note-links';
import {
  MENU_COMMAND_CHANNEL,
  NOTE_WINDOW_CHANNEL,
} from './shared/window-lifecycle';
import { createNoteWindows } from './main/note-windows';
import { isTrustedIpcEvent, trustWebContents } from './main/ipc/note-handlers';
import { failure, success } from './shared/ipc';
import { z } from './shared/validation';
import { NOTE_LINK_CHANNEL } from './shared/external-link';
import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { installCloseGuard } from './main/close-guard';
import { claimSingleInstance, revealWindow } from './main/single-instance';

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
import { IPC_CHANNELS, type NoteChangedEvent } from './shared/ipc';
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

// Automated runs must not change system settings or contact the network.
const isAutomated = app.commandLine.hasSwitch('remote-debugging-port');
const projectUrl = 'https://github.com/craftxdog/InkNotePlus';
let updates: ReturnType<typeof createUpdateChecker> | null = null;

function showMainWindow() {
  if (mainWindow) revealWindow(mainWindow);
  else if (app.isReady() && configuration)
    mainWindow = createWindow(configuration);
}

const noteLinks = createNoteLinkRouter({
  send: (url) => mainWindow?.webContents.send(NOTE_LINK_CHANNEL, url),
  reveal: showMainWindow,
});

const isPrimaryInstance = claimSingleInstance(app, (argv) => {
  showMainWindow();
  const link = noteLinkFromArgv(argv);
  if (link) noteLinks.open(link);
});

// macOS delivers links through this event, even before the app is ready.
app.on('open-url', (event, url) => {
  event.preventDefault();
  noteLinks.open(url);
});

function toggleMainWindow() {
  if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide();
  else showMainWindow();
}

function createAppTray() {
  const icon = nativeImage
    .createFromPath(
      app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(app.getAppPath(), 'assets', 'icon.png'),
    )
    .resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  tray.setToolTip(app.name);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Mostrar ${app.name}`, click: showMainWindow },
      {
        label: 'Nota rápida',
        click: () => noteWindows.open(null),
      },
      { type: 'separator' },
      { role: 'quit', label: 'Salir' },
    ]),
  );
  tray.on('click', showMainWindow);
  return tray;
}

const desktop = createDesktopIntegration({
  globalShortcut,
  createTray: createAppTray,
  toggleWindow: toggleMainWindow,
  quickNote: () => noteWindows.open(null),
  onFailed: (keystroke) =>
    void dialog.showMessageBox({
      type: 'warning',
      title: 'Atajo global',
      message: `No se pudo registrar el atajo ${keystroke}`,
      detail:
        'Otra aplicación puede estar usándolo. Las secuencias de varias teclas no se admiten como atajo global.',
    }),
});

// Linux can fall back to a hardcoded password, which protects nothing.
const systemEncryption: SecretEncryption = {
  isAvailable: () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' ||
      safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: (text) => safeStorage.encryptString(text).toString('base64'),
  decrypt: (text) => safeStorage.decryptString(Buffer.from(text, 'base64')),
};

let syncController: ReturnType<typeof createSyncController> | null = null;
// A separate session lets sync use its own proxy without affecting the app.
const syncSession = () => session.fromPartition('inknote-sync');
function applySyncProxy(activeConfiguration: Configuration) {
  const proxyRules = activeConfiguration.get(coreConfig.appearance).syncProxy;
  void syncSession().setProxy(proxyRules ? { proxyRules } : { mode: 'system' });
}

let localApi: ReturnType<typeof createLocalApiController> | null = null;
function applyLocalApi(activeConfiguration: Configuration) {
  const { localApiEnabled, localApiPort } = activeConfiguration.get(
    coreConfig.appearance,
  );
  void localApi?.apply({ enabled: localApiEnabled, port: localApiPort });
}

let menuSignature = '';
function installAppMenu(activeConfiguration: Configuration) {
  desktop.apply(activeConfiguration.get(coreConfig.appearance));
  const { keybindings, developmentMode } = activeConfiguration.get(
    coreConfig.appearance,
  );
  const signature = JSON.stringify([keybindings, developmentMode]);
  if (signature === menuSignature) return;
  menuSignature = signature;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      appMenuTemplate({
        platform: process.platform,
        appName: app.name,
        keybindings,
        developmentMode,
        sendCommand: (command) => {
          const target = BrowserWindow.getFocusedWindow() ?? mainWindow;
          if (target) target.webContents.send(MENU_COMMAND_CHANNEL, command);
          else showMainWindow();
        },
        checkForUpdates: () => void updates?.check({ manual: true }),
        openProject: () => void shell.openExternal(projectUrl),
      }),
    ),
  );
}

function createAppUpdates(activeConfiguration: Configuration) {
  const showBox = (options: Electron.MessageBoxOptions) =>
    mainWindow
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options);
  return createUpdateChecker({
    currentVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    fetcher: fetch,
    isEnabled: () =>
      activeConfiguration.get(coreConfig.appearance).checkForUpdates,
    getSkippedVersion: () =>
      activeConfiguration.get(coreConfig.skippedUpdateVersion),
    skipVersion: (version) =>
      activeConfiguration.set(coreConfig.skippedUpdateVersion, version),
    openDownload: (url) => shell.openExternal(url),
    async prompt(version, current) {
      const { response } = await showBox({
        type: 'info',
        title: 'Actualización disponible',
        message: `InkNote ${version} está disponible`,
        detail: `Tienes la versión ${current}. Descarga el instalador y ábrelo para actualizar. Tus notas se conservan.`,
        buttons: ['Descargar', 'Más tarde', 'Omitir esta versión'],
        defaultId: 0,
        cancelId: 1,
      });
      return (['download', 'later', 'skip'] as const)[response];
    },
    async notify(result) {
      await showBox({
        type: result === 'current' ? 'info' : 'warning',
        title: 'Actualizaciones',
        message:
          result === 'current'
            ? 'InkNote está actualizado'
            : 'No se pudo comprobar si hay actualizaciones',
        detail:
          result === 'current'
            ? `Tienes la versión ${app.getVersion()}.`
            : 'Comprueba tu conexión e inténtalo de nuevo.',
      });
    },
  });
}

function installSessionSecurity() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // The plugin host sends a stricter policy of its own.
    if (details.url === pluginHostUrl)
      return callback({ responseHeaders: details.responseHeaders });
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

  // Plugins have no network, even for requests the page policy does not cover.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const fromPlugin = details.frame?.url === pluginHostUrl;
    callback({ cancel: fromPlugin && details.url !== pluginHostUrl });
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
}

function hardenWindow(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // A plugin frame could otherwise send data out by navigating or using WebRTC.
  window.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  window.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && event.url !== pluginHostUrl)
      event.preventDefault();
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

function loadRenderer(window: BrowserWindow, search = '') {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    void window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${search}`);
  else
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      { search },
    );
}

const noteWindows = createNoteWindows({
  create(noteId) {
    if (!configuration) throw new Error('Configuration is not active.');
    const window = new BrowserWindow({
      ...createMainWindowOptions({
        configuration,
        isDevelopment,
        preloadPath: path.join(__dirname, 'preload.cjs'),
        iconPath: getAppIconPath(),
      }),
      width: 760,
      height: 640,
    });
    hardenWindow(window);
    const stopTrusting = trustWebContents(window.webContents);
    installCloseGuard(window, ipcMain);
    // Unsaved text blocks the page from closing, so the guard saves it first.
    window.webContents.on('will-prevent-unload', () =>
      setImmediate(() => {
        if (!window.isDestroyed()) window.close();
      }),
    );
    window.once('ready-to-show', () => window.show());
    window.once('closed', stopTrusting);
    loadRenderer(window, `?noteWindow=${noteId ?? 'new'}`);
    return window;
  },
});

function createWindow(activeConfiguration: Configuration): BrowserWindow {
  const window = new BrowserWindow(
    createMainWindowOptions({
      configuration: activeConfiguration,
      isDevelopment,
      preloadPath: path.join(__dirname, 'preload.cjs'),
      iconPath: getAppIconPath(),
    }),
  );

  hardenWindow(window);
  window.webContents.on('did-start-loading', () => noteLinks.rendererGone());
  window.webContents.on('context-menu', (_event, params) => {
    const template = contextMenuTemplate(
      params,
      {
        replaceMisspelling: (word) =>
          window.webContents.replaceMisspelling(word),
        addToDictionary: (word) => {
          window.webContents.session.addWordToSpellCheckerDictionary(word);
        },
        inspect: (x, y) => window.webContents.inspectElement(x, y),
      },
      activeConfiguration.get(coreConfig.appearance).developmentMode,
    );
    if (template.length) Menu.buildFromTemplate(template).popup({ window });
  });
  const lifecycle = installCloseGuard(window, ipcMain);
  window.webContents.on('will-prevent-unload', () => lifecycle.reload());
  // Electron emits this before page keys and native menu accelerators.
  // https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event
  window.webContents.on('before-input-event', (event, input) => {
    const modifier = process.platform === 'darwin' ? input.meta : input.control;
    if (
      input.type !== 'keyDown' ||
      input.alt ||
      !((modifier && input.key.toLowerCase() === 'r') || input.key === 'F5')
    )
      return;
    event.preventDefault();
    lifecycle.reload(input.shift);
  });
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
      noteLinks.rendererGone();
    }
  });

  loadRenderer(window);

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
        setWindowBackground: (color) => mainWindow?.setBackgroundColor(color),
        onPreferencesChanged: () => {
          if (!configuration) return;
          installAppMenu(configuration);
          applyLocalApi(configuration);
          applySyncProxy(configuration);
        },
      });
    },
    deactivate() {
      appearanceHandlers?.dispose();
      appearanceHandlers = null;
    },
  });
  let keymapHandlers: ReturnType<typeof registerKeymapHandlers> | null = null;
  let keymapFile: ReturnType<typeof createKeymapFile> | null = null;
  let aiHandlers: ReturnType<typeof registerAiHandlers> | null = null;
  let aiService: ReturnType<typeof createAiService> | null = null;
  modules.register({
    id: 'core.ai',
    activate() {
      const activeConfig = configuration;
      if (!activeConfig) throw new Error('Configuration is not active.');
      const secret = (definition: typeof coreConfig.aiSecret) =>
        createSecretStore({
          read: () => activeConfig.get(definition),
          write: (value) => activeConfig.set(definition, value),
          encryption: systemEncryption,
        });
      const aiKey = secret(coreConfig.aiSecret);
      const githubToken = secret(coreConfig.githubSecret);
      const service = createAiService({
        getSettings: () => activeConfig.get(coreConfig.appearance),
        getKey: aiKey.get,
        complete: ({ provider, model, baseUrl, apiKey, prompt, signal }) =>
          provider === 'anthropic'
            ? completeWithAnthropic({
                model,
                apiKey: apiKey ?? '',
                prompt,
                signal,
              })
            : completeWithCompatibleApi({
                provider,
                baseUrl,
                model,
                apiKey,
                prompt,
                signal,
              }),
      });
      aiService = service;
      aiHandlers = registerAiHandlers({
        ipc: ipcMain,
        getMainWebContents: () => mainWindow?.webContents ?? null,
        aiKey,
        githubToken,
        run: service.run,
        cancel: service.cancel,
        snippet: (url) => fetchGithubSnippet(url, githubToken.get()),
      });
    },
    deactivate() {
      aiHandlers?.dispose();
      aiHandlers = null;
      aiService?.dispose();
      aiService = null;
    },
  });
  let pluginHandlers: ReturnType<typeof registerPluginHandlers> | null = null;
  modules.register({
    id: 'core.windows',
    activate() {
      ipcMain.handle(NOTE_WINDOW_CHANNEL, (event, input: unknown) => {
        if (!isTrustedIpcEvent(event, mainWindow?.webContents ?? null))
          return failure('unavailable');
        const noteId = z.uuid().nullable().safeParse(input);
        if (!noteId.success) return failure('invalid_input');
        noteWindows.open(noteId.data);
        return success(true);
      });
    },
    deactivate() {
      ipcMain.removeHandler(NOTE_WINDOW_CHANNEL);
    },
  });
  modules.register({
    id: 'core.plugins',
    activate() {
      pluginHandlers = registerPluginHandlers({
        ipc: ipcMain,
        getWindow: () => mainWindow,
        store: createPluginStore(app.getPath('userData')),
      });
    },
    deactivate() {
      pluginHandlers?.dispose();
      pluginHandlers = null;
    },
  });
  modules.register({
    id: 'core.keymap',
    activate() {
      const file = createKeymapFile({
        directory: app.getPath('userData'),
        onChange: (keymap) =>
          mainWindow?.webContents.send(KEYMAP_CHANNELS.changed, keymap),
      });
      keymapFile = file;
      file.start();
      keymapHandlers = registerKeymapHandlers({
        ipc: ipcMain,
        getMainWebContents: () => mainWindow?.webContents ?? null,
        read: file.read,
        ensure: file.ensure,
        openPath: (target) => shell.openPath(target),
      });
    },
    deactivate() {
      keymapHandlers?.dispose();
      keymapHandlers = null;
      keymapFile?.dispose();
      keymapFile = null;
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
                extensions: [
                  'png',
                  'jpg',
                  'jpeg',
                  'gif',
                  'webp',
                  'svg',
                  'heic',
                  'heif',
                ],
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
        fetchTitle: (url) => fetchPageTitle(url),
        onNoteLinksReady: () => noteLinks.rendererReady(),
      });
    },
    deactivate() {
      externalLinkHandler?.dispose();
      externalLinkHandler = null;
    },
  });
  let localApiHandlers: ReturnType<typeof registerLocalApiHandlers> | null =
    null;
  let syncHandlers: ReturnType<typeof registerSyncHandlers> | null = null;
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
        const publishNoteChanged = (event: NoteChangedEvent) => {
          backup?.schedule();
          syncController?.schedule();
          const webContents = mainWindow?.webContents;
          if (webContents && !webContents.isDestroyed()) {
            webContents.send(IPC_CHANNELS.events.noteChanged, event);
          }
          noteWindows.broadcast(IPC_CHANNELS.events.noteChanged, event);
        };
        const commands = new CommandRegistry();
        commandRegistration = registerNoteCommands(commands, repository);
        ipcRegistration = registerNoteIpcHandlers({
          ipc: ipcMain,
          commands,
          getMainWebContents: () => mainWindow?.webContents ?? null,
          onTrashChanged: () => backup?.schedule(),
          publishNoteChanged,
        });

        const libraryRepository = new SqliteLibraryRepository(
          localDatabase,
          repository,
        );
        // Apps and agents only reach the notebook or tag chosen in Preferences.
        const apiBackend = scopeNotesBackend(
          createNotesBackend({
            commands,
            library: libraryRepository,
            publish: publishNoteChanged,
          }),
          () => activeConfig.get(coreConfig.appearance).localApiScope,
        );
        localApi = createLocalApiController({
          createServer: (password) =>
            createLocalApiServer({
              backend: apiBackend,
              username: localApiUsername,
              password,
              version: app.getVersion(),
              allowedOrigins: () =>
                activeConfig.get(coreConfig.appearance)
                  .localApiExtensionOrigins,
              clip: (page) =>
                readClippedPage(page, {
                  storeImage: async (bytes) =>
                    (
                      await storeImage(
                        bytes,
                        userData,
                        (image) =>
                          !nativeImage.createFromBuffer(image).isEmpty(),
                      )
                    ).url,
                }),
            }),
          credentials: createApiCredentials({
            read: () => activeConfig.get(coreConfig.localApiSecret),
            write: (value) =>
              activeConfig.set(coreConfig.localApiSecret, value),
            encryption: systemEncryption,
            generate: () => randomBytes(24).toString('base64url'),
          }),
          onChange: (status) =>
            mainWindow?.webContents.send(LOCAL_API_CHANNELS.changed, status),
        });
        localApiHandlers = registerLocalApiHandlers({
          ipc: ipcMain,
          getMainWebContents: () => mainWindow?.webContents ?? null,
          status: () => localApi!.status(),
          regenerate: () => localApi!.regenerate(),
        });
        applyLocalApi(activeConfig);
        applySyncProxy(activeConfig);
        const syncStore = new SqliteSyncStore(
          localDatabase,
          repository,
          libraryRepository,
          userData,
          (note, removed) => {
            backup?.schedule();
            const event = {
              type: removed || note.deletedAt ? 'trashed' : 'updated',
              note,
            } as const;
            mainWindow?.webContents.send(
              IPC_CHANNELS.events.noteChanged,
              event,
            );
            noteWindows.broadcast(IPC_CHANNELS.events.noteChanged, event);
          },
        );
        const syncSecret = createSecretStore({
          read: () => activeConfig.get(coreConfig.syncSecret),
          write: (value) => activeConfig.set(coreConfig.syncSecret, value),
          encryption: systemEncryption,
        });
        const syncFetch: typeof fetch = (input, init) =>
          syncSession().fetch(input as string, init);
        const couch = (
          connection: StoredSync['connection'],
          password: string,
        ) => createCouchClient({ ...connection, password, fetcher: syncFetch });
        syncController = createSyncController({
          load() {
            const connection = activeConfig.get(coreConfig.syncConnection);
            const secret = syncSecret.get();
            if (!connection || !secret) return null;
            const { password, key } = JSON.parse(secret) as {
              password: string;
              key: string;
            };
            return { connection, password, key };
          },
          save({ connection, password, key }) {
            syncSecret.set(JSON.stringify({ password, key }));
            activeConfig.set(coreConfig.syncConnection, connection);
          },
          clear() {
            syncSecret.clear();
            activeConfig.set(coreConfig.syncConnection, null);
          },
          persisted: systemEncryption.isAvailable,
          run: ({ connection, password, key }) =>
            runSync({
              client: couch(connection, password),
              store: syncStore,
              key: Buffer.from(key, 'base64'),
              targetId: 'couchdb',
            }),
          unlock: async ({ password, passphrase, ...connection }) =>
            (await connectEncryption(couch(connection, password), passphrase))
              .key,
          reset: () => syncStore.reset(),
          onStatus: (status) =>
            mainWindow?.webContents.send(SYNC_CHANNELS.changed, status),
        });
        const activeSync = syncController;
        syncHandlers = registerSyncHandlers({
          ipc: ipcMain,
          getMainWebContents: () => mainWindow?.webContents ?? null,
          status: activeSync.status,
          connect: activeSync.connect,
          disconnect: activeSync.disconnect,
          run: activeSync.runNow,
          diagnose: ({ password, ...connection }) =>
            diagnoseConnection({
              ...connection,
              // A saved connection is checked with its stored password.
              password: password || (activeSync.savedPassword() ?? ''),
              fetcher: syncFetch,
              resolveProxy: (url) => syncSession().resolveProxy(url),
            }),
        });
        activeSync.start();
        libraryHandlers = registerLibraryHandlers({
          ipc: ipcMain,
          repository: libraryRepository,
          getMainWebContents: () => mainWindow?.webContents ?? null,
          onLibraryChanged: () => {
            backup?.schedule();
            syncController?.schedule();
          },
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
          isDecodableImage: (bytes) =>
            !nativeImage.createFromBuffer(bytes).isEmpty(),
          onImported: () => backup?.schedule(),
        });
        database = localDatabase;
        noteCommands = commandRegistration;
        noteIpcHandlers = ipcRegistration;
      } catch (error) {
        syncHandlers?.dispose();
        syncHandlers = null;
        syncController?.dispose();
        syncController = null;
        localApiHandlers?.dispose();
        localApiHandlers = null;
        void localApi?.dispose();
        localApi = null;
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
      syncHandlers?.dispose();
      syncHandlers = null;
      syncController?.dispose();
      syncController = null;
      localApiHandlers?.dispose();
      localApiHandlers = null;
      void localApi?.dispose();
      localApi = null;
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
  if (!isPrimaryInstance) return;
  configureAppIcon();
  installSessionSecurity();
  protocol.handle('inknote-asset', (request) =>
    readAsset(request.url, app.getPath('userData')),
  );
  const activeConfiguration = initializeCoreModules();
  installAppMenu(activeConfiguration);
  updates = createAppUpdates(activeConfiguration);
  if (app.isPackaged && !isAutomated) {
    app.setAsDefaultProtocolClient('inknote');
    updates.start();
  }
  mainWindow = createWindow(activeConfiguration);
  const initialLink = noteLinkFromArgv(process.argv);
  if (initialLink) noteLinks.open(initialLink);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && configuration) {
      mainWindow = createWindow(configuration);
    }
  });
});

app.on('before-quit', () => {
  quitting = true;
  updates?.dispose();
  desktop.dispose();
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
  if (quitting || (process.platform !== 'darwin' && !desktop.keepsRunning()))
    app.quit();
});
