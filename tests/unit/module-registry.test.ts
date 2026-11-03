import { describe, expect, it } from 'vitest';

import {
  DuplicateModuleIdError,
  InvalidModuleIdError,
  ModuleRegistry,
} from '../../src/application/module-registry';

describe('ModuleRegistry', () => {
  it('activates modules in registration order and deactivates in reverse', () => {
    const calls: string[] = [];
    const registry = new ModuleRegistry();
    registry.register({
      id: 'core.config',
      activate: () => calls.push('activate:config'),
      deactivate: () => calls.push('deactivate:config'),
    });
    registry.register({
      id: 'core.notes',
      activate: () => calls.push('activate:notes'),
      deactivate: () => calls.push('deactivate:notes'),
    });

    registry.activateAll();
    registry.deactivateAll();

    expect(calls).toEqual([
      'activate:config',
      'activate:notes',
      'deactivate:notes',
      'deactivate:config',
    ]);
  });

  it('deactivates already active modules when a later activation fails', () => {
    const calls: string[] = [];
    const registry = new ModuleRegistry();
    const failure = new Error('Notes module failed.');
    registry.register({
      id: 'core.config',
      activate: () => calls.push('activate:config'),
      deactivate: () => calls.push('deactivate:config'),
    });
    registry.register({
      id: 'core.notes',
      activate: () => {
        calls.push('activate:notes');
        throw failure;
      },
      deactivate: () => calls.push('deactivate:notes'),
    });

    expect(() => registry.activateAll()).toThrow(failure);
    expect(calls).toEqual([
      'activate:config',
      'activate:notes',
      'deactivate:config',
    ]);
  });

  it('rejects malformed and duplicate module identifiers', () => {
    const registry = new ModuleRegistry();

    expect(() =>
      registry.register({
        id: 'core:notes',
        activate: () => undefined,
        deactivate: () => undefined,
      }),
    ).toThrow(InvalidModuleIdError);

    registry.register({
      id: 'core.notes',
      activate: () => undefined,
      deactivate: () => undefined,
    });

    expect(() =>
      registry.register({
        id: 'core.notes',
        activate: () => undefined,
        deactivate: () => undefined,
      }),
    ).toThrow(DuplicateModuleIdError);
  });
});
