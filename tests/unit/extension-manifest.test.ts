import { describe, expect, it } from 'vitest';

import {
  extensionApiVersion,
  extensionManifestSchema,
} from '../../src/shared/extension-manifest';

function createManifest() {
  return {
    id: 'io.inknote.sample',
    name: 'Sample extension',
    version: '1.0.0',
    apiVersion: extensionApiVersion,
    entry: 'dist/index.mjs',
    capabilities: ['notes.read', 'commands.register', 'ui.slot'],
    contributes: {
      commands: [
        {
          id: 'io.inknote.sample:insert-template',
          title: 'Insert template',
        },
      ],
      slots: [
        {
          id: 'io.inknote.sample:sidebar',
          slot: 'sidebar',
          title: 'Sample',
        },
      ],
    },
  };
}

describe('extension manifest contract', () => {
  it('accepts an explicit, namespaced declarative manifest', () => {
    expect(extensionManifestSchema.parse(createManifest())).toMatchObject({
      id: 'io.inknote.sample',
      apiVersion: extensionApiVersion,
      capabilities: ['notes.read', 'commands.register', 'ui.slot'],
    });
  });

  it('does not grant implicit capabilities for declared contributions', () => {
    const manifest = createManifest();
    manifest.capabilities = ['notes.read'];

    expect(extensionManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects duplicate permissions and contribution identifiers', () => {
    const manifest = createManifest();
    manifest.capabilities = [
      'notes.read',
      'notes.read',
      'commands.register',
      'ui.slot',
    ];
    manifest.contributes.slots[0] = {
      ...manifest.contributes.slots[0],
      id: 'io.inknote.sample:insert-template',
    };

    expect(extensionManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('requires contributions to stay inside the declared extension namespace', () => {
    const manifest = createManifest();
    manifest.contributes.commands[0] = {
      ...manifest.contributes.commands[0],
      id: 'io.inknote.other:insert-template',
    };

    expect(extensionManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects incompatible API versions and unsafe entry paths', () => {
    const incompatibleVersion = createManifest();
    incompatibleVersion.apiVersion = 2;
    const unsafePath = createManifest();
    unsafePath.entry = '../outside.mjs';

    expect(extensionManifestSchema.safeParse(incompatibleVersion).success).toBe(
      false,
    );
    expect(extensionManifestSchema.safeParse(unsafePath).success).toBe(false);
  });
});
