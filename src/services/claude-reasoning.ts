import type {
  JudgeCritique,
  RiskItem,
  AntiPattern,
  AddAntiPatternInput,
} from '../types';
import { aiComplete, aiCompleteAsJudge, getActiveProvider, getJudgeModel } from './ai-provider';

const JUDGE_SYSTEM_PROMPT = `You are THE JUDGE — an adversarial code plan critic. Your sole purpose is to find risks, mistakes, and anti-patterns in proposed coding plans BEFORE code is written.

## YOUR ROLE
You are a devil's advocate. You assume every plan contains hidden risks until proven otherwise. You are thorough, specific, and constructive — you don't just say "this is bad," you explain WHY it's bad and HOW to fix it.

## RULES
1. You may ONLY cite anti-patterns that are provided in the ANTI-PATTERN DATABASE section below. Do not invent new anti-patterns.
2. Every risk you identify MUST reference a specific anti-pattern by its ID and title.
3. You must quote the SPECIFIC part of the plan that triggers each risk.
4. Your suggested fixes must be concrete and actionable — no vague advice like "be more careful."
5. If the plan is genuinely good, say so. Do not manufacture risks that don't exist.
6. Rate overall risk from 0.0 (no risk) to 1.0 (critical danger).

## VERDICT CRITERIA
- "approve": Risk score < 0.3, no critical/high severity risks
- "revise": Risk score 0.3-0.7, or any high severity risks that have clear fixes
- "reject": Risk score > 0.7, or any critical severity risks, or fundamental architectural problems

## OUTPUT FORMAT
You MUST respond with ONLY a JSON object in this exact schema:
{
  "overall_risk_score": 0.0-1.0,
  "risks": [
    {
      "risk_title": "Short description of the risk",
      "plan_excerpt": "The exact text from the plan that triggers this risk",
      "matched_antipattern_id": "UUID of the matched anti-pattern",
      "matched_antipattern_title": "Title of the matched anti-pattern",
      "explanation": "Why this is dangerous, with context",
      "suggested_fix": "Concrete fix with code example if applicable",
      "severity": "critical|high|medium|low"
    }
  ],
  "safe_aspects": ["List of things the plan does correctly"],
  "refined_plan_suggestions": ["Concrete suggestions to improve the plan"],
  "verdict": "approve|revise|reject"
}`;

function formatAntiPatternContext(patterns: AntiPattern[]): string {
  return patterns
    .map(
      (p, i) => `ANTI-PATTERN [${i + 1}]: ${p.title}
  ID: ${p.id}
  Category: ${p.category} | Severity: ${p.severity}
  Description: ${p.description}
  Root Cause: ${p.root_cause}
  Bad Example: ${p.bad_code}
  Prevention: ${p.prevention_strategy}`
    )
    .join('\n\n');
}

export async function callJudge(
  plan: string,
  task: string,
  antipatterns: AntiPattern[],
  codeContext?: string
): Promise<JudgeCritique> {
  const maxRetries = 2;

  const userMessage = `## TASK DESCRIPTION
${task}

## PROPOSED PLAN
${plan}

${codeContext ? `## EXISTING CODE CONTEXT\n${codeContext}\n` : ''}
## ANTI-PATTERN DATABASE (${antipatterns.length} entries)
${formatAntiPatternContext(antipatterns)}

Analyze the proposed plan against the anti-pattern database. Output ONLY the JSON critique.`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await aiCompleteAsJudge({
        system: JUDGE_SYSTEM_PROMPT,
        userMessage,
        maxTokens: 4096,
      });

      let jsonText = response.text.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
      if (!jsonText.startsWith('{')) {
        const objMatch = jsonText.match(/\{[\s\S]*\}/);
        if (objMatch) {
          jsonText = objMatch[0];
        }
      }

      const critique = JSON.parse(jsonText) as JudgeCritique;

      if (typeof critique.overall_risk_score !== 'number') {
        critique.overall_risk_score = 0.5;
      }
      if (!Array.isArray(critique.risks)) {
        critique.risks = [];
      }
      if (!Array.isArray(critique.safe_aspects)) {
        critique.safe_aspects = [];
      }
      if (!Array.isArray(critique.refined_plan_suggestions)) {
        critique.refined_plan_suggestions = [];
      }
      if (!['approve', 'revise', 'reject'].includes(critique.verdict)) {
        critique.verdict = critique.overall_risk_score > 0.7 ? 'reject' : critique.overall_risk_score > 0.3 ? 'revise' : 'approve';
      }

      return critique;
    } catch (err) {
      console.error(`[Judge] Attempt ${attempt + 1} failed:`, (err as Error).message);
      if (attempt === maxRetries) {
        console.error('[Judge] All attempts failed, returning cautionary fallback');
        return {
          overall_risk_score: 0.5,
          risks: [],
          safe_aspects: ['Plan could not be analyzed due to API errors'],
          refined_plan_suggestions: [
            'Manual review recommended — the automated judge was unable to analyze this plan',
          ],
          verdict: 'revise',
        };
      }
    }
  }

  return {
    overall_risk_score: 0.5,
    risks: [],
    safe_aspects: [],
    refined_plan_suggestions: ['Manual review recommended'],
    verdict: 'revise',
  };
}

export async function extractTechStack(description: string): Promise<string[]> {
  try {
    const response = await aiComplete({
      system: 'Extract technology names from the description. Return ONLY a JSON array of lowercase strings. Include programming languages, databases, frameworks, cloud services, and tools mentioned or implied. Example: ["python", "fastapi", "postgresql", "docker"]',
      userMessage: description,
      maxTokens: 512,
    });

    const match = response.text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const result = JSON.parse(match[0]);
    return Array.isArray(result)
      ? result.map((s: unknown) => String(s).toLowerCase())
      : [];
  } catch (err) {
    console.error('[TechStack] Extraction failed:', (err as Error).message);
    return [];
  }
}

export async function analyzeInterviewResponse(
  response: string,
  techStack: string[]
): Promise<AddAntiPatternInput | null> {
  try {
    const apiResponse = await aiComplete({
      system: `You analyze developer interview responses about past coding mistakes. If the response describes a specific, actionable anti-pattern, extract it into a structured format. If the response is too vague or not about a specific coding mistake, respond with {"is_antipattern": false}.

If it IS an anti-pattern, respond with:
{
  "is_antipattern": true,
  "category": "security_vulnerability|performance_issue|architecture_smell|database_antipattern|devops_misconfiguration|error_handling|testing_gap|data_integrity",
  "subcategory": "snake_case_description",
  "severity": "critical|high|medium|low|info",
  "title": "Short descriptive title",
  "description": "2-3 sentence description",
  "root_cause": "Why this happens",
  "bad_code": "Example of the bad pattern (code)",
  "good_code": "Example of the correct approach (code)",
  "detection_hint": "How to find this in code",
  "prevention_strategy": "How to prevent this"
}`,
      userMessage: `Developer's tech stack: ${techStack.join(', ')}\n\nDeveloper's response: ${response}`,
      maxTokens: 2048,
    });

    let jsonText = apiResponse.text.trim();
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) jsonText = match[0];

    const parsed = JSON.parse(jsonText);

    if (!parsed.is_antipattern) return null;

    return {
      category: parsed.category,
      subcategory: parsed.subcategory,
      severity: parsed.severity,
      title: parsed.title,
      description: parsed.description,
      root_cause: parsed.root_cause,
      bad_code: parsed.bad_code,
      good_code: parsed.good_code,
      detection_hint: parsed.detection_hint,
      prevention_strategy: parsed.prevention_strategy,
      tech_stack: techStack,
      source: 'developer_interview',
      confidence_score: 0.70,
    } as AddAntiPatternInput;
  } catch (err) {
    console.error('[Interview] Analysis failed:', (err as Error).message);
    return null;
  }
}

export async function generateInterviewQuestions(
  techStack: string[],
  domains: string[],
  existingPatterns: AntiPattern[]
): Promise<{ category: string; question: string }[]> {
  try {
    const existingContext =
      existingPatterns.length > 0
        ? `\nExisting anti-patterns in DB (for recognition-trigger questions):\n${existingPatterns
            .slice(0, 5)
            .map((p) => `- ${p.title}: ${p.description}`)
            .join('\n')}`
        : '';

    const response = await aiComplete({
      system: `Generate targeted interview questions to extract coding failure knowledge from a developer. Return a JSON array of objects with "category" and "question" fields.

Question categories and counts:
- "stack_specific" (2-3): Questions specific to their tech stack
- "deployment" (2-3): Questions about deployment and infrastructure mistakes
- "security" (1-2): Security-related past mistakes
- "pre_mortem" (1-2): "Imagine this system fails in 6 months — what went wrong?"
- "recognition_trigger" (1-2): Show existing DB entries and ask "Has something similar happened to you?"

Generate 7-12 questions total. Make them open-ended but specific enough to elicit concrete anti-patterns.
Output ONLY the JSON array.`,
      userMessage: `Tech stack: ${techStack.join(', ')}\nDomains: ${domains.join(', ')}${existingContext}`,
      maxTokens: 2048,
    });

    const match = response.text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const questions = JSON.parse(match[0]);
    return Array.isArray(questions)
      ? questions.filter(
          (q: { category?: string; question?: string }) =>
            q.category && q.question
        )
      : [];
  } catch (err) {
    console.error('[Interview] Question generation failed:', (err as Error).message);
    return [
      { category: 'stack_specific', question: `What's the most painful bug you've encountered with ${techStack[0] || 'your tech stack'}?` },
      { category: 'stack_specific', question: 'What coding shortcut have you taken that later caused problems?' },
      { category: 'deployment', question: 'Describe a deployment that went wrong. What was the root cause?' },
      { category: 'deployment', question: 'What configuration mistake has caused you the most downtime?' },
      { category: 'security', question: 'Have you ever shipped a security vulnerability? What was it?' },
      { category: 'pre_mortem', question: 'If your current project fails catastrophically in 6 months, what would be the most likely cause?' },
      { category: 'pre_mortem', question: 'What technical debt are you most worried about right now?' },
    ];
  }
}
