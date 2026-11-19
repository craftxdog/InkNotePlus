import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError } from './compatible-provider';
import type { AiPrompt } from './prompts';

// These models accept effort and server-side fallback after a safety refusal.
const currentModels = new Set([
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

export function anthropicRequest(model: string, prompt: AiPrompt) {
  return {
    model,
    max_tokens: prompt.maxTokens,
    system: prompt.system,
    messages: [{ role: 'user' as const, content: prompt.user }],
    ...(currentModels.has(model)
      ? {
          output_config: { effort: prompt.effort },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }
      : {}),
  };
}

export async function completeWithAnthropic(options: {
  model: string;
  apiKey: string;
  prompt: AiPrompt;
  signal?: AbortSignal;
}) {
  const client = new Anthropic({
    apiKey: options.apiKey,
    timeout: 120_000,
    maxRetries: 1,
  });
  try {
    const response = await client.beta.messages.create(
      anthropicRequest(options.model, options.prompt),
      { signal: options.signal },
    );
    if (response.stop_reason === 'refusal')
      throw new AiProviderError('refused');
    return response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError)
      throw new AiProviderError('cancelled');
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    )
      throw new AiProviderError('auth');
    if (error instanceof Anthropic.RateLimitError)
      throw new AiProviderError('rate_limit');
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError('failed');
  }
}
