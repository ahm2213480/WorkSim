import { z } from 'zod';
import { getEnv } from '../env.js';

/** The AI layer is intentionally small: one interface, one real provider, one
 *  test double. Both AI features are "generate structured JSON from evidence,
 *  validate, store, degrade gracefully" — so a single `complete()` call with a
 *  JSON schema is the entire abstraction. No agents, no streaming, no retries
 *  inside the provider: the features own their own retry/fallback semantics.
 *
 *  Provider: Gemini through its OpenAI-compatible Chat Completions endpoint
 *  (configured through AI_BASE_URL / AI_API_KEY / AI_MODEL). Raw `fetch` — no
 *  SDK dependency, easy to explain, and the failure modes (timeout, non-JSON,
 *  error envelope) are explicit below. */

export interface AiCompletion {
  content: string;
  model: string;
}

export interface AiProvider {
  /** Returns the model's text output, or throws `AiUnavailableError` when the
   *  provider cannot be reached or refuses the request. Never throws other
   *  error types, so callers only handle one failure shape. */
  complete(system: string, user: string, maxOutputChars: number): Promise<AiCompletion>;
  /** Human-readable name for storage metadata (e.g. "gemini:gemini-2.0-flash"). */
  describe(): string;
}

/** The one error type the AI layer raises. `code` distinguishes "no key
 *  configured" (expected in local dev) from real provider failures. */
export class AiUnavailableError extends Error {
  constructor(
    readonly code: 'AI_NOT_CONFIGURED' | 'AI_TIMEOUT' | 'AI_PROVIDER_ERROR' | 'AI_RATE_LIMITED' | 'AI_INVALID_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }).passthrough() }).passthrough()).min(1),
}).passthrough();

/** Gemini provider over plain fetch, using Gemini's OpenAI-compatible Chat
 *  Completions endpoint. No SDK: the request shape and every failure mode are
 *  explicit below, which is what makes this explainable in an interview. */
export class GeminiProvider implements AiProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  describe(): string {
    return `gemini:${this.model}`;
  }

  async complete(system: string, user: string, maxOutputChars: number): Promise<AiCompletion> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let content: string;
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          // No `response_format` here: Gemini's endpoint rejects it, while others
          // ignore it. The prompt itself demands the JSON shape and the caller
          // validates the result.
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          max_tokens: Math.ceil(maxOutputChars / 3),
        }),
        signal: controller.signal,
      });
      if (response.status === 429) throw new AiUnavailableError('AI_RATE_LIMITED', 'The AI provider is rate limiting requests.');
      if (!response.ok) throw new AiUnavailableError('AI_PROVIDER_ERROR', `The AI provider returned ${response.status}.`);
      const body: unknown = await response.json().catch(() => {
        throw new AiUnavailableError('AI_INVALID_RESPONSE', 'The AI provider returned malformed JSON.');
      });
      const parsed = responseSchema.safeParse(body);
      const firstChoice = parsed.success ? parsed.data.choices[0] : undefined;
      if (!firstChoice || firstChoice.message.content.length === 0) {
        throw new AiUnavailableError('AI_INVALID_RESPONSE', 'The AI provider response has an unexpected shape.');
      }
      content = firstChoice.message.content;
    } catch (error) {
      if (error instanceof AiUnavailableError) throw error;
      // Abort from our own timeout, or a network-level fetch failure.
      throw new AiUnavailableError('AI_TIMEOUT', 'The AI provider did not respond in time.');
    } finally {
      clearTimeout(timer);
    }
    return { content: content.slice(0, maxOutputChars), model: this.model };
  }
}

export function isAiConfigured(): boolean {
  return Boolean(getEnv().AI_API_KEY);
}

/** One place decides which provider the app uses. No key => the deterministic
 *  product still works and AI surfaces as "unavailable"; a key => the real
 *  provider. Tests inject their own double through AiService instead. */
export function defaultProvider(): AiProvider {
  const env = getEnv();
  if (!env.AI_API_KEY) {
    return {
      describe: () => 'none',
      complete: async () => { throw new AiUnavailableError('AI_NOT_CONFIGURED', 'No AI provider is configured.'); },
    };
  }
  return new GeminiProvider(env.AI_BASE_URL, env.AI_API_KEY, env.AI_MODEL, env.AI_TIMEOUT_MS);
}
