import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection';
import { searchAntiPatterns } from '../services/hybrid-search';
import { callJudge } from '../services/claude-reasoning';
import type {
  CritiquePlanInput,
  CritiquePlanOutput,
  AntiPattern,
} from '../types';

/**
 * Tool 4: critique_plan — THE JUDGE
 * Submit a coding plan for adversarial critique against the anti-pattern database.
 */
export async function critiquePlan(input: CritiquePlanInput): Promise<CritiquePlanOutput> {
  const sessionId = uuidv4();

  // Step 1: Create planning session
  await query(
    `INSERT INTO planning_sessions (
      id, task_description, task_module, tech_stack, initial_plan, status
    ) VALUES ($1, $2, $3, $4, $5, 'proposed')`,
    [
      sessionId,
      input.task_description,
      input.task_module || null,
      input.tech_stack || [],
      input.plan,
    ]
  );

  // Step 2: Search for relevant anti-patterns (top 7)
  const searchQuery = `${input.task_description} ${input.plan}`;
  const antipatterns = await searchAntiPatterns(searchQuery, {
    tech_stack: input.tech_stack,
    max_results: 7,
  });

  // Store matched anti-pattern IDs and scores
  const matchedIds = antipatterns.map((a) => a.id);
  const matchScores = antipatterns.map((a) => a.rrf_score || 0);

  await query(
    `UPDATE planning_sessions
     SET matched_antipatterns = $1, match_scores = $2
     WHERE id = $3`,
    [matchedIds, matchScores, sessionId]
  );

  // Step 3: Call the Judge
  const critique = await callJudge(
    input.plan,
    input.task_description,
    antipatterns as AntiPattern[],
    input.code_context
  );

  // Step 4: Store critique results
  const critiqueRefs = critique.risks
    .map((r) => r.matched_antipattern_id)
    .filter(Boolean);

  await query(
    `UPDATE planning_sessions
     SET critique = $1,
         critique_references = $2,
         risk_score = $3,
         risks_identified = $4,
         status = 'critiqued',
         critiqued_at = NOW()
     WHERE id = $5`,
    [
      JSON.stringify(critique),
      critiqueRefs,
      critique.overall_risk_score,
      JSON.stringify(critique.risks),
      sessionId,
    ]
  );

  // Step 5: Update times_helpful for referenced anti-patterns
  if (critiqueRefs.length > 0) {
    await query(
      `UPDATE anti_patterns
       SET times_helpful = times_helpful + 1
       WHERE id = ANY($1)`,
      [critiqueRefs]
    );
  }

  return {
    session_id: sessionId,
    critique,
    antipatterns_consulted: antipatterns.length,
    antipatterns_matched: critiqueRefs.length,
  };
}
