import * as crypto from 'crypto';
import { aiCompleteForEmbedding, getActiveProvider } from './ai-provider';

const EMBEDDING_DIM = 1024;
const RATE_LIMIT_CALLS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const embeddingCache = new Map<string, number[]>();
const rateLimitTracker: number[] = [];

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function checkRateLimit(): boolean {
  const now = Date.now();
  while (rateLimitTracker.length > 0 && rateLimitTracker[0] < now - RATE_LIMIT_WINDOW_MS) {
    rateLimitTracker.shift();
  }
  return rateLimitTracker.length < RATE_LIMIT_CALLS;
}

function recordRateLimitCall(): void {
  rateLimitTracker.push(Date.now());
}

export function hashBasedEmbedding(text: string): number[] {
  const hash = hashText(text);
  const vector: number[] = [];

  let currentHash = hash;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    if (i % 32 === 0 && i > 0) {
      currentHash = crypto.createHash('sha256').update(currentHash + i.toString()).digest('hex');
    }
    const byteIndex = (i % 32) * 2;
    const byteVal = parseInt(currentHash.substring(byteIndex, byteIndex + 2), 16);
    vector.push((byteVal / 127.5) - 1.0);
  }

  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] = vector[i] / magnitude;
    }
  }

  return vector;
}

async function llmEmbedding(text: string): Promise<number[] | null> {
  const provider = getActiveProvider();
  const hasKey = provider === 'openai'
    ? !!process.env.OPENAI_API_KEY
    : !!process.env.ANTHROPIC_API_KEY;

  if (!hasKey) return null;

  if (!checkRateLimit()) {
    console.error('[Embedding] Rate limit reached, falling back to hash-based embedding');
    return null;
  }

  try {
    recordRateLimitCall();

    const response = await aiCompleteForEmbedding({
      system: `You are an embedding generator. Given a text about a coding anti-pattern or software engineering concept, produce a JSON array of exactly ${EMBEDDING_DIM} floating-point numbers between -1 and 1 that represents the semantic meaning of the text. Consider these dimensions: technical domain, failure mode, technology stack, severity level, prevention approach, code pattern, and architectural impact. Output ONLY the JSON array, nothing else.`,
      userMessage: `Generate a ${EMBEDDING_DIM}-dimensional embedding vector for the following text:\n\n${text.substring(0, 2000)}`,
      maxTokens: 8192,
      timeoutMs: 15000,
    });

    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[Embedding] Could not parse JSON array from response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length !== EMBEDDING_DIM) {
      console.error(`[Embedding] Expected ${EMBEDDING_DIM} dimensions, got ${parsed.length}`);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const result: number[] = [];
        for (let i = 0; i < EMBEDDING_DIM; i++) {
          result.push(parsed[i % parsed.length] || 0);
        }
        return result;
      }
      return null;
    }

    return parsed.map((v: unknown) => {
      const num = Number(v);
      return isNaN(num) ? 0 : Math.max(-1, Math.min(1, num));
    });
  } catch (err) {
    console.error('[Embedding] API error:', (err as Error).message);
    return null;
  }
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const cacheKey = hashText(text);

  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  const llmResult = await llmEmbedding(text);
  if (llmResult) {
    embeddingCache.set(cacheKey, llmResult);
    return llmResult;
  }

  console.error('[Embedding] Falling back to hash-based embedding');
  const hashResult = hashBasedEmbedding(text);
  embeddingCache.set(cacheKey, hashResult);
  return hashResult;
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    results.push(embedding);
    await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}
