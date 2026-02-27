import { query } from '../db/connection';
import { parseFromDescription, parseFromFiles } from '../services/stack-parser';
import type { SeedFromStackInput, SeedFromStackOutput, AntiPattern } from '../types';

/**
 * Tool 1: seed_from_stack
 * Parse tech stack from a project description, return matching anti-patterns
 * with a risk briefing markdown.
 */
export async function seedFromStack(input: SeedFromStackInput): Promise<SeedFromStackOutput> {
  // Detect stack from description
  const descStack = parseFromDescription(input.project_description);

  // Optionally detect from files
  let fileStack = { tech_stack: [] as string[], frameworks: [] as string[], domains: [] as string[] };
  if (input.project_path) {
    try {
      fileStack = parseFromFiles(input.project_path);
    } catch (err) {
      console.error('[SeedFromStack] File parsing failed:', (err as Error).message);
    }
  }

  // Merge detected stacks
  const detected = {
    tech_stack: [...new Set([...descStack.tech_stack, ...fileStack.tech_stack])],
    frameworks: [...new Set([...descStack.frameworks, ...fileStack.frameworks])],
    domains: [...new Set([...descStack.domains, ...fileStack.domains])],
  };

  // Query matching anti-patterns
  const allStack = [...detected.tech_stack, ...detected.frameworks];

  let matches: AntiPattern[];
  if (allStack.length > 0) {
    const result = await query(
      `SELECT * FROM anti_patterns
       WHERE tech_stack && $1 OR frameworks && $2 OR domains && $3
       ORDER BY severity DESC, confidence_score DESC
       LIMIT 30`,
      [allStack, detected.frameworks, detected.domains]
    );
    matches = result.rows;
  } else {
    // No stack detected, return all with high confidence
    const result = await query(
      `SELECT * FROM anti_patterns
       ORDER BY severity DESC, confidence_score DESC
       LIMIT 20`
    );
    matches = result.rows;
  }

  // Increment times_surfaced
  if (matches.length > 0) {
    const ids = matches.map((m) => m.id);
    await query(
      'UPDATE anti_patterns SET times_surfaced = times_surfaced + 1 WHERE id = ANY($1)',
      [ids]
    );
  }

  // Generate risk briefing markdown
  const briefing = generateRiskBriefing(detected, matches);

  return {
    detected_stack: detected,
    matching_antipatterns: matches,
    risk_briefing: briefing,
    total_matches: matches.length,
  };
}

function generateRiskBriefing(
  stack: { tech_stack: string[]; frameworks: string[]; domains: string[] },
  patterns: AntiPattern[]
): string {
  const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const categoryCounts: Record<string, number> = {};

  for (const p of patterns) {
    severityCounts[p.severity] = (severityCounts[p.severity] || 0) + 1;
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }

  let md = `# Risk Briefing for Project\n\n`;
  md += `**Detected Stack**: ${stack.tech_stack.join(', ') || 'none detected'}\n`;
  md += `**Frameworks**: ${stack.frameworks.join(', ') || 'none detected'}\n`;
  md += `**Domains**: ${stack.domains.join(', ') || 'general'}\n\n`;

  md += `## Risk Summary\n`;
  md += `- **Total matching anti-patterns**: ${patterns.length}\n`;
  if (severityCounts.critical > 0)
    md += `- **Critical**: ${severityCounts.critical} (address before writing any code)\n`;
  if (severityCounts.high > 0)
    md += `- **High**: ${severityCounts.high} (address in planning phase)\n`;
  if (severityCounts.medium > 0) md += `- **Medium**: ${severityCounts.medium}\n`;
  if (severityCounts.low > 0) md += `- **Low**: ${severityCounts.low}\n`;

  md += `\n## Top Risks by Category\n`;
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    md += `- **${cat.replace(/_/g, ' ')}**: ${count} patterns\n`;
  }

  // Top 5 critical/high patterns
  const topPatterns = patterns
    .filter((p) => p.severity === 'critical' || p.severity === 'high')
    .slice(0, 5);

  if (topPatterns.length > 0) {
    md += `\n## Critical & High Priority Anti-Patterns\n`;
    for (const p of topPatterns) {
      md += `\n### ${p.severity.toUpperCase()}: ${p.title}\n`;
      md += `${p.description}\n`;
      md += `**Prevention**: ${p.prevention_strategy}\n`;
    }
  }

  return md;
}
