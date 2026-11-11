import type { IpcMain, WebContents } from 'electron';
import type { Configuration } from '../../application/config';
import { coreConfig } from '../../application/core-config';
import { failure, success } from '../../shared/ipc';
import {
  PREFERENCES_CHANNELS,
  preferencesPatchSchema,
} from '../../shared/preferences';
import { isTrustedIpcEvent } from './note-handlers';
import {
  WINDOW_CHANNELS,
  windowBackgroundSchema,
} from '../../shared/window-lifecycle';

export function registerPreferencesHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  configuration: Configuration;
  getMainWebContents: () => WebContents | null;
  styleNonce: string;
  platform: NodeJS.Platform;
  setWindowBackground?: (color: string) => void;
}) {
  const { ipc, configuration } = options;
  ipc.handle(WINDOW_CHANNELS.background, (event, input: unknown) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    const color = windowBackgroundSchema.safeParse(input);
    if (!color.success) return failure('invalid_input');
    try {
      if (configuration.get(coreConfig.window.background) !== color.data)
        configuration.set(coreConfig.window.background, color.data);
      options.setWindowBackground?.(color.data);
      return success(true);
    } catch {
      return failure('unavailable');
    }
  });
  ipc.handle(PREFERENCES_CHANNELS.get, (event) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    return success({
      preferences: configuration.get(coreConfig.appearance),
      styleNonce: options.styleNonce,
      platform: options.platform,
    });
  });
  ipc.handle(PREFERENCES_CHANNELS.update, (event, input: unknown) => {
    if (!isTrustedIpcEvent(event, options.getMainWebContents()))
      return failure('unavailable');
    const parsed = preferencesPatchSchema.safeParse(input);
    if (!parsed.success) return failure('invalid_input');
    try {
      const next = {
        ...configuration.get(coreConfig.appearance),
        ...parsed.data,
      };
      configuration.set(coreConfig.appearance, next);
      return success(next);
    } catch {
      return failure('unavailable');
    }
  });
  return {
    dispose() {
      ipc.removeHandler(PREFERENCES_CHANNELS.get);
      ipc.removeHandler(PREFERENCES_CHANNELS.update);
      ipc.removeHandler(WINDOW_CHANNELS.background);
    },
  };
}
