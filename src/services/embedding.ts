import Anthropic from '@anthropic-ai/sdk';
import * as crypto from 'crypto';

const EMBEDDING_DIM = 1024;
const RATE_LIMIT_CALLS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// In-memory cache for embeddings
const embeddingCache = new Map<string, number[]>();
const rateLimitTracker: number[] = [];

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function checkRateLimit(): boolean {
  const now = Date.now();
  // Remove old entries outside the window
  while (rateLimitTracker.length > 0 && rateLimitTracker[0] < now - RATE_LIMIT_WINDOW_MS) {
    rateLimitTracker.shift();
  }
  return rateLimitTracker.length < RATE_LIMIT_CALLS;
}

function recordRateLimitCall(): void {
  rateLimitTracker.push(Date.now());
}

/**
 * Generate a deterministic hash-based vector (fallback).
 * Uses SHA-256 as a PRNG seed to generate 1024 normalized floats.
 */
export function hashBasedEmbedding(text: string): number[] {
  const hash = hashText(text);
  const vector: number[] = [];

  // Use the hash to seed a deterministic PRNG
  let currentHash = hash;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    if (i % 32 === 0 && i > 0) {
      // Generate new hash bytes when we exhaust current ones
      currentHash = crypto.createHash('sha256').update(currentHash + i.toString()).digest('hex');
    }
    // Take 2 hex chars (1 byte) and convert to float in [-1, 1]
    const byteIndex = (i % 32) * 2;
    const byteVal = parseInt(currentHash.substring(byteIndex, byteIndex + 2), 16);
    vector.push((byteVal / 127.5) - 1.0);
  }

  // Normalize the vector to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] = vector[i] / magnitude;
    }
  }

  return vector;
}

/**
 * Primary: Ask Claude to produce a semantic embedding.
 */
async function claudeEmbedding(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) {
    return null;
  }

  if (!checkRateLimit()) {
    console.error('[Embedding] Rate limit reached, falling back to hash-based embedding');
    return null;
  }

  const model = process.env.EMBEDDING_MODEL || 'claude-sonnet-4-5-20250929';

  try {
    recordRateLimitCall();
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: `You are an embedding generator. Given a text about a coding anti-pattern or software engineering concept, produce a JSON array of exactly ${EMBEDDING_DIM} floating-point numbers between -1 and 1 that represents the semantic meaning of the text. Consider these dimensions: technical domain, failure mode, technology stack, severity level, prevention approach, code pattern, and architectural impact. Output ONLY the JSON array, nothing else.`,
      messages: [
        {
          role: 'user',
          content: `Generate a ${EMBEDDING_DIM}-dimensional embedding vector for the following text:\n\n${text.substring(0, 2000)}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return null;
    }

    // Extract JSON array from response
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[Embedding] Could not parse JSON array from Claude response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length !== EMBEDDING_DIM) {
      console.error(`[Embedding] Expected ${EMBEDDING_DIM} dimensions, got ${parsed.length}`);
      // If we got some array, try to pad or truncate
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
    console.error('[Embedding] Claude API error:', (err as Error).message);
    return null;
  }
}

/**
 * Generate an embedding with 3-tier fallback:
 * 1. Claude API semantic embedding
 * 2. Deterministic hash-based vector
 * 3. null (search falls back to keyword-only)
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const cacheKey = hashText(text);

  // Check cache first
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  // Tier 1: Claude API
  const claudeResult = await claudeEmbedding(text);
  if (claudeResult) {
    embeddingCache.set(cacheKey, claudeResult);
    return claudeResult;
  }

  // Tier 2: Hash-based fallback
  console.error('[Embedding] Falling back to hash-based embedding');
  const hashResult = hashBasedEmbedding(text);
  embeddingCache.set(cacheKey, hashResult);
  return hashResult;
}

/**
 * Batch generate embeddings for multiple texts.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    results.push(embedding);
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}
