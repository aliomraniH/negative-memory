import { query } from '../db/connection';
import { searchAntiPatterns } from './search-antipatterns';
import { aiCompleteAsJudge, getActiveProvider, getJudgeProvider, getJudgeModel } from '../services/ai-provider';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface DeepAnalysisInput {
  task: string;
  context?: string;
  tech_stack?: string[];
  depth?: 'standard' | 'deep' | 'exhaustive';
}

export interface DeepAnalysisOutput {
  analysis: string;
  thinking_summary: string;
  identified_risks: string[];
  recommendations: string[];
  relevant_antipatterns: { id: string; title: string; relevance: string }[];
  depth_used: string;
  provider: string;
  model: string;
  thinking_tokens_used?: number;
}

const DEEP_ANALYSIS_SYSTEM = `You are an expert software architect performing deep analysis. You think step by step through complex problems, considering multiple angles, edge cases, failure modes, and architectural implications.

Your analysis should be thorough and structured:

1. **Understanding**: Restate the problem in your own words
2. **Architecture Review**: Evaluate the design and patterns used
3. **Risk Assessment**: Identify potential failure modes, security issues, performance bottlenecks
4. **Edge Cases**: Consider unusual inputs, race conditions, resource exhaustion
5. **Best Practices**: Compare against industry standards and known anti-patterns
6. **Recommendations**: Provide prioritized, actionable improvements

When code context is provided, analyze it line by line for issues.
When anti-patterns from the database are provided, ground your analysis in those known failure patterns.

Output your analysis as a JSON object:
{
  "analysis": "Detailed multi-paragraph analysis",
  "identified_risks": ["Risk 1", "Risk 2", ...],
  "recommendations": ["Recommendation 1", "Recommendation 2", ...],
  "antipattern_references": [{"id": "uuid", "title": "name", "relevance": "why it applies"}]
}`;

function getDepthConfig(depth: string): { maxTokens: number; budgetTokens: number } {
  switch (depth) {
    case 'exhaustive':
      return { maxTokens: 16000, budgetTokens: 10000 };
    case 'deep':
      return { maxTokens: 10000, budgetTokens: 6000 };
    default:
      return { maxTokens: 6000, budgetTokens: 3000 };
  }
}

async function callWithExtendedThinking(
  system: string,
  userMessage: string,
  depth: string
): Promise<{ text: string; thinkingSummary: string; provider: string; model: string; thinkingTokens?: number }> {
  const judgeProvider = getJudgeProvider();
  const config = getDepthConfig(depth);

  if (judgeProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = getJudgeModel();

    try {
      const response = await client.messages.create({
        model,
        max_tokens: config.maxTokens,
        thinking: {
          type: 'enabled',
          budget_tokens: config.budgetTokens,
        },
        messages: [
          { role: 'user', content: `${system}\n\n---\n\n${userMessage}` },
        ],
      });

      let text = '';
      let thinkingSummary = '';
      let thinkingTokens = 0;

      for (const block of response.content) {
        if (block.type === 'thinking') {
          thinkingSummary = (block as any).thinking || '';
          thinkingTokens = thinkingSummary.length;
        } else if (block.type === 'text') {
          text = block.text;
        }
      }

      if (thinkingSummary.length > 500) {
        thinkingSummary = thinkingSummary.substring(0, 500) + '... [truncated]';
      }

      return { text, thinkingSummary, provider: 'anthropic', model, thinkingTokens };
    } catch (err) {
      console.error('[DeepAnalysis] Anthropic extended thinking failed, falling back:', (err as Error).message);
    }
  }

  if (judgeProvider === 'openai' && process.env.OPENAI_API_KEY) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = getJudgeModel();

    const thinkingPrompt = `Before providing your final analysis, think through this problem step by step. Consider multiple angles, failure modes, and edge cases.

After your thinking, provide the structured JSON output.`;

    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${thinkingPrompt}\n\n${userMessage}` },
      ],
    });

    const text = response.choices?.[0]?.message?.content || '';
    const usage = response.usage as any;
    const thinkingTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;

    return {
      text,
      thinkingSummary: thinkingTokens > 0
        ? `Model used ${thinkingTokens} reasoning tokens for deep analysis`
        : 'Standard reasoning applied',
      provider: 'openai',
      model,
      thinkingTokens,
    };
  }

  const result = await aiCompleteAsJudge({
    system,
    userMessage,
    maxTokens: config.maxTokens,
  });

  return { text: result.text, thinkingSummary: 'Fallback: standard completion', provider: result.provider, model: result.model };
}

export async function deepAnalysis(input: DeepAnalysisInput): Promise<DeepAnalysisOutput> {
  const depth = input.depth || 'standard';

  const searchQuery = input.task + (input.context ? '\n' + input.context.substring(0, 500) : '');
  let relevantPatterns: { id: string; title: string; description: string }[] = [];

  try {
    const searchResults = await searchAntiPatterns({
      query: searchQuery,
      tech_stack: input.tech_stack,
      max_results: 5,
    });
    if (Array.isArray(searchResults)) {
      relevantPatterns = searchResults.map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
      }));
    }
  } catch (err) {
    console.error('[DeepAnalysis] Anti-pattern search failed:', (err as Error).message);
  }

  const antipatternContext = relevantPatterns.length > 0
    ? `\n\n## RELEVANT ANTI-PATTERNS FROM DATABASE\n${relevantPatterns.map((p, i) => `[${i + 1}] ${p.title} (ID: ${p.id})\n   ${p.description}`).join('\n\n')}`
    : '';

  const userMessage = `## TASK
${input.task}

${input.context ? `## CODE/CONTEXT\n\`\`\`\n${input.context}\n\`\`\`` : ''}

${input.tech_stack?.length ? `## TECH STACK: ${input.tech_stack.join(', ')}` : ''}${antipatternContext}

Perform a ${depth} analysis. Think carefully and thoroughly.`;

  const response = await callWithExtendedThinking(DEEP_ANALYSIS_SYSTEM, userMessage, depth);

  let parsed: any = {};
  try {
    let jsonText = response.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonText = jsonMatch[1].trim();
    if (!jsonText.startsWith('{')) {
      const objMatch = jsonText.match(/\{[\s\S]*\}/);
      if (objMatch) jsonText = objMatch[0];
    }
    parsed = JSON.parse(jsonText);
  } catch {
    parsed = {
      analysis: response.text,
      identified_risks: [],
      recommendations: [],
      antipattern_references: [],
    };
  }

  const output: DeepAnalysisOutput = {
    analysis: parsed.analysis || response.text,
    thinking_summary: response.thinkingSummary,
    identified_risks: Array.isArray(parsed.identified_risks) ? parsed.identified_risks : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    relevant_antipatterns: Array.isArray(parsed.antipattern_references) ? parsed.antipattern_references : [],
    depth_used: depth,
    provider: response.provider,
    model: response.model,
    thinking_tokens_used: response.thinkingTokens,
  };

  try {
    await query(
      `INSERT INTO tool_invocations (tool_name, input_summary, output_summary, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'deep_analysis',
        JSON.stringify({ task: input.task.substring(0, 200), depth }).substring(0, 500),
        `Risks: ${output.identified_risks.length}, Recommendations: ${output.recommendations.length}, Provider: ${response.provider}`,
        0,
        null,
      ]
    );
  } catch {}

  return output;
}
