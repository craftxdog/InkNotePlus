import { z } from '../shared/validation';

import { defineConfig, type ConfigDefinition } from './config';
import { defaultPreferences, preferencesSchema } from '../shared/preferences';
import { windowBackgroundSchema } from '../shared/window-lifecycle';

const dimensionSchema = z.number().int().min(320).max(10_000);

export const coreConfig = {
  appearance: defineConfig({
    key: 'core.appearance',
    schema: preferencesSchema,
    defaultValue: defaultPreferences,
  }),
  backupDirectory: defineConfig({
    key: 'core.backup.directory',
    schema: z.string().min(1).nullable(),
    defaultValue: null,
  }),
  window: {
    background: defineConfig({
      key: 'core.window.background',
      schema: windowBackgroundSchema,
      defaultValue: '#ffffff',
    }),
    initialHeight: defineConfig({
      key: 'core.window.initialHeight',
      schema: dimensionSchema,
      defaultValue: 800,
    }),
    initialWidth: defineConfig({
      key: 'core.window.initialWidth',
      schema: dimensionSchema,
      defaultValue: 1_280,
    }),
    minimumHeight: defineConfig({
      key: 'core.window.minimumHeight',
      schema: dimensionSchema,
      defaultValue: 480,
    }),
    minimumWidth: defineConfig({
      key: 'core.window.minimumWidth',
      schema: dimensionSchema,
      defaultValue: 640,
    }),
  },
} as const;

export const coreConfigDefinitions: readonly ConfigDefinition<unknown>[] = [
  coreConfig.appearance,
  coreConfig.backupDirectory,
  coreConfig.window.background,
  coreConfig.window.initialHeight,
  coreConfig.window.initialWidth,
  coreConfig.window.minimumHeight,
  coreConfig.window.minimumWidth,
] as const;
