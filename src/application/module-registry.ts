import type { Disposable } from './disposable';

const moduleIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export interface ApplicationModule {
  readonly id: string;
  activate(): void;
  deactivate(): void;
}

export class InvalidModuleIdError extends Error {
  constructor(moduleId: string) {
    super(`Invalid module identifier: ${moduleId}`);
    this.name = 'InvalidModuleIdError';
  }
}

export class DuplicateModuleIdError extends Error {
  constructor(moduleId: string) {
    super(`Module identifier is already registered: ${moduleId}`);
    this.name = 'DuplicateModuleIdError';
  }
}

export class ModuleRegistryStateError extends Error {
  constructor() {
    super('Modules cannot be registered after activation starts.');
    this.name = 'ModuleRegistryStateError';
  }
}

interface RegisteredModule {
  readonly token: symbol;
  readonly module: ApplicationModule;
}

export class ModuleRegistry {
  readonly #modules: RegisteredModule[] = [];
  #isActive = false;
  #hasActivated = false;

  register(module: ApplicationModule): Disposable {
    if (!moduleIdPattern.test(module.id)) {
      throw new InvalidModuleIdError(module.id);
    }
    if (this.#hasActivated) {
      throw new ModuleRegistryStateError();
    }
    if (this.#modules.some(({ module: current }) => current.id === module.id)) {
      throw new DuplicateModuleIdError(module.id);
    }

    const registration: RegisteredModule = {
      token: Symbol(module.id),
      module,
    };
    this.#modules.push(registration);

    return {
      dispose: () => {
        if (this.#hasActivated) {
          return;
        }
        const index = this.#modules.findIndex(
          ({ token }) => token === registration.token,
        );
        if (index >= 0) {
          this.#modules.splice(index, 1);
        }
      },
    };
  }

  activateAll(): void {
    if (this.#isActive) {
      return;
    }

    this.#hasActivated = true;
    const activated: ApplicationModule[] = [];
    try {
      for (const { module } of this.#modules) {
        module.activate();
        activated.push(module);
      }
      this.#isActive = true;
    } catch (error) {
      for (const module of activated.toReversed()) {
        try {
          module.deactivate();
        } catch {
          // Preserve the activation failure while attempting complete cleanup.
        }
      }
      throw error;
    }
  }

  deactivateAll(): void {
    if (!this.#isActive) {
      return;
    }

    this.#isActive = false;
    let firstError: unknown;
    for (const { module } of this.#modules.toReversed()) {
      try {
        module.deactivate();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) {
      throw firstError;
    }
  }
}
