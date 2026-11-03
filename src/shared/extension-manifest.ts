import { z } from 'zod';

export const extensionApiVersion = 1;

export const extensionCapabilitySchema = z.enum([
  'notes.read',
  'notes.write',
  'commands.register',
  'ui.slot',
]);

export const extensionSlotSchema = z.enum([
  'sidebar',
  'editor.toolbar',
  'note.preview',
]);

const extensionIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/);
const contributionIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9.-]*:[a-z][a-z0-9-]*$/);
const semanticVersionSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
const entrypointSchema = z
  .string()
  .regex(/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/);

const commandContributionSchema = z
  .object({
    id: contributionIdSchema,
    title: z.string().trim().min(1).max(120),
  })
  .strict();

const slotContributionSchema = z
  .object({
    id: contributionIdSchema,
    slot: extensionSlotSchema,
    title: z.string().trim().min(1).max(120),
  })
  .strict();

export const extensionManifestSchema = z
  .object({
    id: extensionIdSchema,
    name: z.string().trim().min(1).max(80),
    version: semanticVersionSchema,
    apiVersion: z.literal(extensionApiVersion),
    entry: entrypointSchema,
    capabilities: z.array(extensionCapabilitySchema).max(4),
    contributes: z
      .object({
        commands: z.array(commandContributionSchema).max(32),
        slots: z.array(slotContributionSchema).max(16),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
      context.addIssue({
        code: 'custom',
        message: 'Capabilities must not contain duplicates.',
        path: ['capabilities'],
      });
    }

    if (
      manifest.contributes.commands.length > 0 &&
      !manifest.capabilities.includes('commands.register')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Command contributions require commands.register.',
        path: ['contributes', 'commands'],
      });
    }

    if (
      manifest.contributes.slots.length > 0 &&
      !manifest.capabilities.includes('ui.slot')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Slot contributions require ui.slot.',
        path: ['contributes', 'slots'],
      });
    }

    const contributionIds = [
      ...manifest.contributes.commands.map(({ id }) => id),
      ...manifest.contributes.slots.map(({ id }) => id),
    ];
    if (new Set(contributionIds).size !== contributionIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Contribution identifiers must be unique.',
        path: ['contributes'],
      });
    }

    for (const [
      index,
      contribution,
    ] of manifest.contributes.commands.entries()) {
      if (!contribution.id.startsWith(`${manifest.id}:`)) {
        context.addIssue({
          code: 'custom',
          message: 'Command identifiers must use the extension namespace.',
          path: ['contributes', 'commands', index, 'id'],
        });
      }
    }

    for (const [index, contribution] of manifest.contributes.slots.entries()) {
      if (!contribution.id.startsWith(`${manifest.id}:`)) {
        context.addIssue({
          code: 'custom',
          message: 'Slot identifiers must use the extension namespace.',
          path: ['contributes', 'slots', index, 'id'],
        });
      }
    }
  });

export type ExtensionCapability = z.output<typeof extensionCapabilitySchema>;
export type ExtensionManifest = z.output<typeof extensionManifestSchema>;
export type ExtensionSlot = z.output<typeof extensionSlotSchema>;
