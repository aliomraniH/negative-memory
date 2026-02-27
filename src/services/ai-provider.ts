import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type AIProvider = 'openai' | 'anthropic';

export type AIRole = 'provider' | 'judge' | 'embedding';

export interface AICompletionOptions {
  system: string;
  userMessage: string;
  maxTokens: number;
  timeoutMs?: number;
}

export interface AICompletionResult {
  text: string;
  provider: AIProvider;
  model: string;
}

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export function getActiveProvider(): AIProvider {
  const configured = process.env.AI_PROVIDER?.toLowerCase();
  if (configured === 'anthropic' || configured === 'claude') return 'anthropic';
  if (configured === 'openai' || configured === 'gpt') return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'anthropic';
}

export function getJudgeProvider(): AIProvider {
  const configured = process.env.JUDGE_PROVIDER?.toLowerCase();
  if (configured === 'anthropic' || configured === 'claude') return 'anthropic';
  if (configured === 'openai' || configured === 'gpt') return 'openai';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'openai';
}

export function getEmbeddingProvider(): AIProvider {
  const configured = process.env.EMBEDDING_PROVIDER?.toLowerCase();
  if (configured === 'anthropic' || configured === 'claude') return 'anthropic';
  if (configured === 'openai' || configured === 'gpt') return 'openai';
  const active = getActiveProvider();
  return active;
}

export function getJudgeModel(): string {
  if (process.env.JUDGE_MODEL) return process.env.JUDGE_MODEL;
  const provider = getJudgeProvider();
  return provider === 'openai' ? 'gpt-5.2' : 'claude-sonnet-4-5-20250929';
}

export function getEmbeddingModel(): string {
  if (process.env.EMBEDDING_MODEL) return process.env.EMBEDDING_MODEL;
  const provider = getEmbeddingProvider();
  return provider === 'openai' ? 'gpt-5.2' : 'claude-sonnet-4-5-20250929';
}

export function getProviderModel(): string {
  if (process.env.PROVIDER_MODEL) return process.env.PROVIDER_MODEL;
  const provider = getActiveProvider();
  return provider === 'openai' ? 'gpt-5.2' : 'claude-sonnet-4-5-20250929';
}

export function getAvailableModels(): { provider: AIProvider; models: string[] }[] {
  const result: { provider: AIProvider; models: string[] }[] = [];
  if (process.env.OPENAI_API_KEY) {
    result.push({
      provider: 'openai',
      models: ['gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'o4-mini', 'o3', 'gpt-4.1', 'gpt-4o'],
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    result.push({
      provider: 'anthropic',
      models: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-20250414'],
    });
  }
  return result;
}

export function getProviderStatus(): {
  active_provider: AIProvider;
  judge_provider: AIProvider;
  judge_model: string;
  embedding_provider: AIProvider;
  embedding_model: string;
  provider_model: string;
  openai_configured: boolean;
  anthropic_configured: boolean;
  openai_key_preview: string | null;
  anthropic_key_preview: string | null;
} {
  return {
    active_provider: getActiveProvider(),
    judge_provider: getJudgeProvider(),
    judge_model: getJudgeModel(),
    embedding_provider: getEmbeddingProvider(),
    embedding_model: getEmbeddingModel(),
    provider_model: getProviderModel(),
    openai_configured: !!process.env.OPENAI_API_KEY,
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    openai_key_preview: process.env.OPENAI_API_KEY
      ? process.env.OPENAI_API_KEY.substring(0, 10) + '...'
      : null,
    anthropic_key_preview: process.env.ANTHROPIC_API_KEY
      ? process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...'
      : null,
  };
}

async function callAnthropic(
  model: string,
  options: AICompletionOptions
): Promise<AICompletionResult> {
  const client = getAnthropicClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');

  const createOpts: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: options.maxTokens,
    system: options.system,
    messages: [{ role: 'user', content: options.userMessage }],
  };

  let response: Anthropic.Message;
  if (options.timeoutMs) {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), options.timeoutMs);
    response = await client.messages.create(createOpts, {
      signal: abortController.signal as AbortSignal,
    });
    clearTimeout(timer);
  } else {
    response = await client.messages.create(createOpts);
  }

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Anthropic');

  return { text: content.text, provider: 'anthropic', model };
}

async function callOpenAI(
  model: string,
  options: AICompletionOptions
): Promise<AICompletionResult> {
  const client = getOpenAIClient();
  if (!client) throw new Error('OPENAI_API_KEY not configured');

  const createOpts: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    max_completion_tokens: options.maxTokens,
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: options.userMessage },
    ],
  };

  let response: OpenAI.Chat.Completions.ChatCompletion;
  if (options.timeoutMs) {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), options.timeoutMs);
    response = await client.chat.completions.create(createOpts, {
      signal: abortController.signal as AbortSignal,
    });
    clearTimeout(timer);
  } else {
    response = await client.chat.completions.create(createOpts);
  }

  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI');

  return { text, provider: 'openai', model };
}

function callByProvider(provider: AIProvider, model: string, options: AICompletionOptions): Promise<AICompletionResult> {
  if (provider === 'openai') return callOpenAI(model, options);
  return callAnthropic(model, options);
}

export async function aiComplete(options: AICompletionOptions): Promise<AICompletionResult> {
  const provider = getActiveProvider();
  const model = getProviderModel();
  return callByProvider(provider, model, options);
}

export async function aiCompleteAsJudge(options: AICompletionOptions): Promise<AICompletionResult> {
  const provider = getJudgeProvider();
  const model = getJudgeModel();
  return callByProvider(provider, model, options);
}

export async function aiCompleteForEmbedding(options: AICompletionOptions): Promise<AICompletionResult> {
  const provider = getEmbeddingProvider();
  const model = getEmbeddingModel();
  return callByProvider(provider, model, options);
}

export async function aiCompleteWithModel(
  provider: AIProvider,
  model: string,
  options: AICompletionOptions
): Promise<AICompletionResult> {
  return callByProvider(provider, model, options);
}
