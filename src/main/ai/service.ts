import type { AiProvider, AiRequest, AiResponse } from '../../shared/ai';
import { AiProviderError, usableBaseUrl } from './compatible-provider';
import { buildAiPrompt, type AiPrompt } from './prompts';

export interface AiCompletion {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey: string | null;
  prompt: AiPrompt;
  signal: AbortSignal;
}

const defaultBaseUrls: Readonly<Record<AiProvider, string>> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  ollama: 'http://127.0.0.1:11434',
};

export function createAiService(options: {
  getSettings: () => {
    aiEnabled: boolean;
    aiProvider: AiProvider;
    aiModel: string;
    aiBaseUrl: string;
  };
  getKey: () => string | null;
  complete: (completion: AiCompletion) => Promise<string>;
}) {
  const running = new Map<string, AbortController>();
  return {
    async run(request: AiRequest): Promise<AiResponse> {
      const settings = options.getSettings();
      if (!settings.aiEnabled) return { status: 'disabled' };
      const provider = settings.aiProvider;
      const baseUrl = usableBaseUrl(
        settings.aiBaseUrl || defaultBaseUrls[provider],
      );
      if (!baseUrl) return { status: 'bad_address' };
      const apiKey = options.getKey();
      if (!apiKey && provider !== 'ollama') return { status: 'no_key' };
      const controller = new AbortController();
      running.set(request.requestId, controller);
      try {
        const text = await options.complete({
          provider,
          model: settings.aiModel,
          baseUrl,
          apiKey,
          prompt: buildAiPrompt(request),
          signal: controller.signal,
        });
        return { status: 'ok', text };
      } catch (error) {
        if (controller.signal.aborted) return { status: 'cancelled' };
        return {
          status: error instanceof AiProviderError ? error.code : 'failed',
        };
      } finally {
        running.delete(request.requestId);
      }
    },
    cancel(requestId: string) {
      running.get(requestId)?.abort();
    },
    dispose() {
      for (const controller of running.values()) controller.abort();
      running.clear();
    },
  };
}
