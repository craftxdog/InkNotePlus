import { z } from '../../shared/validation';
import type { AiErrorStatus } from '../../shared/ai';
import type { AiPrompt } from './prompts';

export class AiProviderError extends Error {
  constructor(readonly code: AiErrorStatus) {
    super(code);
  }
}

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Note text must never travel unencrypted beyond this computer.
export function usableBaseUrl(value: string) {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  if (url.username || url.password) return null;
  const secure =
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && loopback.has(url.hostname));
  return secure ? value.replace(/\/+$/, '') : null;
}

const chatSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
});
const ollamaSchema = z.object({ message: z.object({ content: z.string() }) });

export async function completeWithCompatibleApi(options: {
  provider: 'openai' | 'ollama';
  baseUrl: string;
  model: string;
  apiKey: string | null;
  prompt: AiPrompt;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}) {
  const { provider, prompt } = options;
  const messages = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  const response = await (options.fetcher ?? fetch)(
    `${options.baseUrl}${provider === 'ollama' ? '/api/chat' : '/chat/completions'}`,
    {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      signal: options.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey
          ? { authorization: `Bearer ${options.apiKey}` }
          : {}),
      },
      body: JSON.stringify(
        provider === 'ollama'
          ? { model: options.model, messages, stream: false }
          : { model: options.model, messages, max_tokens: prompt.maxTokens },
      ),
    },
  );
  if (response.status === 401 || response.status === 403)
    throw new AiProviderError('auth');
  if (response.status === 429) throw new AiProviderError('rate_limit');
  if (!response.ok) throw new AiProviderError('failed');
  const body: unknown = await response.json().catch(() => null);
  if (provider === 'ollama') {
    const parsed = ollamaSchema.safeParse(body);
    if (parsed.success) return parsed.data.message.content;
  } else {
    const parsed = chatSchema.safeParse(body);
    if (parsed.success) return parsed.data.choices[0].message.content;
  }
  throw new AiProviderError('failed');
}
