import type { App, BrowserWindow } from 'electron';

type InstanceApp = Pick<App, 'requestSingleInstanceLock' | 'quit'> & {
  on(
    event: 'second-instance',
    listener: (event: unknown, argv: string[]) => void,
  ): unknown;
};

// SQLite, config.json and the backup folder assume one writer per profile.
// https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata
export function claimSingleInstance(
  app: InstanceApp,
  onSecondInstance: (argv: readonly string[]) => void,
) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', (_event, argv) => onSecondInstance(argv));
  return true;
}

export function revealWindow(
  window: Pick<BrowserWindow, 'isMinimized' | 'restore' | 'show' | 'focus'>,
) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
