import { app } from 'electron';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import metadata from '../../package.json';

export function getAppIconPath(): string {
  return path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), 'assets'),
    'icon.png',
  );
}

export function configureAppIcon(): void {
  const iconPath = getAppIconPath();
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    applicationVersion: app.getVersion(),
    iconPath,
  });
  // BrowserWindow.icon does not set the macOS Dock icon, including during development.
  // https://www.electronjs.org/docs/latest/api/dock#dockseticonimage-macos
  if (process.platform === 'darwin') app.dock?.setIcon(iconPath);

  const updater = path.resolve(
    path.dirname(process.execPath),
    '..',
    'Update.exe',
  );
  if (process.platform === 'win32' && app.isPackaged && existsSync(updater)) {
    // Match the identity Squirrel writes into the installed shortcuts.
    app.setAppUserModelId(
      `com.squirrel.${metadata.name}.${metadata.productName}`,
    );
    // Squirrel normally downloads this icon. Use its locally branded updater so
    // Windows Apps & Features also works offline and survives version changes.
    execFile(
      'reg.exe',
      [
        'add',
        `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${metadata.name}`,
        '/v',
        'DisplayIcon',
        '/t',
        'REG_SZ',
        '/d',
        `"${updater}",0`,
        '/f',
      ],
      { windowsHide: true },
      (error) => {
        if (error)
          console.warn(
            'Could not register the installed application icon:',
            error.message,
          );
      },
    );
  }
}
