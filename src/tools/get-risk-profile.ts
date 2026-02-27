import { query } from '../db/connection';
import type { GetRiskProfileInput, RiskProfileOutput, AntiPattern, PlanningSession } from '../types';

/**
 * Tool 5: get_risk_profile
 * Get a risk summary for a module or technology area.
 */
export async function getRiskProfile(input: GetRiskProfileInput): Promise<RiskProfileOutput> {
  // Build filter conditions
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (input.tech_stack && input.tech_stack.length > 0) {
    conditions.push(`tech_stack && $${paramIdx}`);
    params.push(input.tech_stack);
    paramIdx++;
  }

  if (input.domains && input.domains.length > 0) {
    conditions.push(`domains && $${paramIdx}`);
    params.push(input.domains);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Aggregate by category
  const catResult = await query(
    `SELECT category, COUNT(*) as cnt
     FROM anti_patterns ${whereClause}
     GROUP BY category ORDER BY cnt DESC`,
    params
  );

  const byCategory: Record<string, number> = {};
  for (const row of catResult.rows) {
    byCategory[row.category] = parseInt(row.cnt, 10);
  }

  // Aggregate by severity
  const sevResult = await query(
    `SELECT severity, COUNT(*) as cnt
     FROM anti_patterns ${whereClause}
     GROUP BY severity ORDER BY cnt DESC`,
    params
  );

  const bySeverity: Record<string, number> = {};
  for (const row of sevResult.rows) {
    bySeverity[row.severity] = parseInt(row.cnt, 10);
  }

  // Total count
  const totalResult = await query(
    `SELECT COUNT(*) as cnt FROM anti_patterns ${whereClause}`,
    params
  );
  const total = parseInt(totalResult.rows[0].cnt, 10);

  // Top 5 risks (highest severity, most surfaced)
  const topResult = await query(
    `SELECT * FROM anti_patterns ${whereClause}
     ORDER BY
       CASE severity
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
         WHEN 'info' THEN 5
       END,
       times_surfaced DESC
     LIMIT 5`,
    params
  );

  // Recent planning sessions
  let sessionConditions: string[] = [];
  const sessionParams: unknown[] = [];
  let sessionParamIdx = 1;

  if (input.module) {
    sessionConditions.push(`task_module = $${sessionParamIdx}`);
    sessionParams.push(input.module);
    sessionParamIdx++;
  }

  if (input.tech_stack && input.tech_stack.length > 0) {
    sessionConditions.push(`tech_stack && $${sessionParamIdx}`);
    sessionParams.push(input.tech_stack);
    sessionParamIdx++;
  }

  const sessionWhere = sessionConditions.length > 0
    ? 'WHERE ' + sessionConditions.join(' AND ')
    : '';

  const sessionsResult = await query(
    `SELECT * FROM planning_sessions ${sessionWhere}
     ORDER BY created_at DESC LIMIT 5`,
    sessionParams
  );

  return {
    summary: {
      total_antipatterns: total,
      by_category: byCategory,
      by_severity: bySeverity,
    },
    top_risks: topResult.rows as AntiPattern[],
    recent_sessions: sessionsResult.rows as PlanningSession[],
  };
}
