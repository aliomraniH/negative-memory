import { query } from '../db/connection';
import type { ValidateAntiPatternInput, ValidateAntiPatternOutput, AntiPattern } from '../types';

/**
 * Tool 6: validate_antipattern
 * Developer confirms or rejects an anti-pattern's relevance.
 * Adjusts confidence scores up or down.
 */
export async function validateAntiPattern(
  input: ValidateAntiPatternInput
): Promise<ValidateAntiPatternOutput> {
  // Fetch current state
  const current = await query(
    'SELECT id, title, confidence_score, severity, validated_by_developer FROM anti_patterns WHERE id = $1',
    [input.antipattern_id]
  );

  if (current.rows.length === 0) {
    throw new Error(`Anti-pattern not found: ${input.antipattern_id}`);
  }

  const before = current.rows[0] as AntiPattern;

  // Calculate new confidence score
  let newConfidence: number;
  if (input.is_relevant) {
    // Positive validation: boost confidence by 0.15, max 1.0
    newConfidence = Math.min(1.0, before.confidence_score + 0.15);
  } else {
    // Negative validation: reduce confidence by 0.20, min 0.0
    newConfidence = Math.max(0.0, before.confidence_score - 0.20);
  }

  const newSeverity = input.severity_override || before.severity;

  // Update the anti-pattern
  await query(
    `UPDATE anti_patterns
     SET confidence_score = $1,
         severity = $2,
         validated_by_developer = TRUE,
         developer_context = COALESCE($3, developer_context),
         times_helpful = times_helpful + $4,
         updated_at = NOW()
     WHERE id = $5`,
    [
      newConfidence,
      newSeverity,
      input.developer_notes || null,
      input.is_relevant ? 1 : 0,
      input.antipattern_id,
    ]
  );

  return {
    antipattern_id: input.antipattern_id,
    title: before.title,
    before: {
      confidence_score: before.confidence_score,
      severity: before.severity,
    },
    after: {
      confidence_score: newConfidence,
      severity: newSeverity,
    },
    developer_notes: input.developer_notes || null,
  };
}
