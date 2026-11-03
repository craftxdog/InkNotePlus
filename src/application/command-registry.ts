import type { Disposable } from './disposable';

export type { Disposable } from './disposable';

const commandIdPattern = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export interface CommandDefinition<TInput, TData> {
  id: string;
  execute(input: TInput): TData | Promise<TData>;
}

export type CommandResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: CommandError };

export interface CommandError {
  code: 'command.not-found' | 'command.failed';
  message: string;
}

export class InvalidCommandIdError extends Error {
  constructor(commandId: string) {
    super(`Invalid command identifier: ${commandId}`);
    this.name = 'InvalidCommandIdError';
  }
}

export class DuplicateCommandIdError extends Error {
  constructor(commandId: string) {
    super(`Command identifier is already registered: ${commandId}`);
    this.name = 'DuplicateCommandIdError';
  }
}

interface RegisteredCommand {
  token: symbol;
  execute(input: unknown): Promise<unknown>;
}

export class CommandRegistry {
  readonly #commands = new Map<string, RegisteredCommand>();

  register<TInput, TData>(
    definition: CommandDefinition<TInput, TData>,
  ): Disposable {
    validateCommandId(definition.id);

    if (this.#commands.has(definition.id)) {
      throw new DuplicateCommandIdError(definition.id);
    }

    const token = Symbol(definition.id);
    this.#commands.set(definition.id, {
      token,
      execute: async (input) => definition.execute(input as TInput),
    });

    return {
      dispose: () => {
        const current = this.#commands.get(definition.id);
        if (current?.token === token) {
          this.#commands.delete(definition.id);
        }
      },
    };
  }

  async execute<TData>(
    commandId: string,
    input: unknown,
  ): Promise<CommandResult<TData>> {
    const command = this.#commands.get(commandId);
    if (!command) {
      return commandNotFound();
    }

    try {
      const data = await command.execute(input);
      return { ok: true, data: data as TData };
    } catch {
      return {
        ok: false,
        error: {
          code: 'command.failed',
          message: 'Command could not be completed.',
        },
      };
    }
  }
}

function validateCommandId(commandId: string): void {
  if (!commandIdPattern.test(commandId)) {
    throw new InvalidCommandIdError(commandId);
  }
}

function commandNotFound<TData>(): CommandResult<TData> {
  return {
    ok: false,
    error: {
      code: 'command.not-found',
      message: 'Command is not available.',
    },
  };
}
