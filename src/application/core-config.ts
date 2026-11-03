import { z } from '../shared/validation';

import { defineConfig, type ConfigDefinition } from './config';
import { defaultPreferences, preferencesSchema } from '../shared/preferences';

const dimensionSchema = z.number().int().min(320).max(10_000);

export const coreConfig = {
  appearance: defineConfig({
    key: 'core.appearance',
    schema: preferencesSchema,
    defaultValue: defaultPreferences,
  }),
  window: {
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
  coreConfig.window.initialHeight,
  coreConfig.window.initialWidth,
  coreConfig.window.minimumHeight,
  coreConfig.window.minimumWidth,
] as const;
