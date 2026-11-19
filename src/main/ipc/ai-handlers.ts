import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import type { ZodType } from 'zod';
import {
  AI_CHANNELS,
  aiCancelSchema,
  aiKeySchema,
  aiRequestSchema,
  type AiRequest,
  type AiResponse,
  type AiStatus,
} from '../../shared/ai';
import {
  GITHUB_CHANNELS,
  githubTokenSchema,
  githubUrlSchema,
  type GithubSnippetResponse,
} from '../../shared/github-snippet';
import { failure, success } from '../../shared/ipc';
import { isTrustedIpcEvent } from './note-handlers';

interface Secret {
  get(): string | null;
  set(value: string): void;
  clear(): void;
  persisted(): boolean;
}

export function registerAiHandlers(options: {
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>;
  getMainWebContents: () => WebContents | null;
  aiKey: Secret;
  githubToken: Secret;
  run: (request: AiRequest) => Promise<AiResponse>;
  cancel: (requestId: string) => void;
  snippet: (url: string) => Promise<GithubSnippetResponse>;
}) {
  const channels: string[] = [];
  function handle<T>(
    channel: string,
    schema: ZodType<T>,
    run: (input: T) => unknown,
  ) {
    options.ipc.handle(
      channel,
      async (event: IpcMainInvokeEvent, input: unknown) => {
        if (!isTrustedIpcEvent(event, options.getMainWebContents()))
          return failure('unavailable');
        const parsed = schema.safeParse(input);
        if (!parsed.success) return failure('invalid_input');
        try {
          return success(await run(parsed.data));
        } catch {
          return failure('unavailable');
        }
      },
    );
    channels.push(channel);
  }
  const none = aiKeySchema.optional() as unknown as ZodType<undefined>;
  // The renderer learns only whether a key exists, never its value.
  const status = (): AiStatus => ({
    hasKey: !!options.aiKey.get(),
    persisted: options.aiKey.persisted(),
  });
  handle(AI_CHANNELS.status, none, status);
  handle(AI_CHANNELS.setKey, aiKeySchema, (key) => {
    options.aiKey.set(key);
    return status();
  });
  handle(AI_CHANNELS.clearKey, none, () => {
    options.aiKey.clear();
    return status();
  });
  handle(AI_CHANNELS.run, aiRequestSchema, options.run);
  handle(AI_CHANNELS.cancel, aiCancelSchema, (id) => {
    options.cancel(id);
    return true;
  });
  handle(GITHUB_CHANNELS.snippet, githubUrlSchema, options.snippet);
  handle(GITHUB_CHANNELS.status, none, () => !!options.githubToken.get());
  handle(GITHUB_CHANNELS.setToken, githubTokenSchema, (token) => {
    options.githubToken.set(token);
    return true;
  });
  handle(GITHUB_CHANNELS.clearToken, none, () => {
    options.githubToken.clear();
    return false;
  });
  return {
    dispose() {
      for (const channel of channels) options.ipc.removeHandler(channel);
    },
  };
}
