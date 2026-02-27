import { query } from '../db/connection';
import { generateEmbedding } from '../services/embedding';
import { CONFIDENCE_DEFAULTS } from '../types';
import type { AddAntiPatternInput, AntiPattern } from '../types';

/**
 * Tool 3: add_antipattern
 * Add a new anti-pattern to the database. Checks for near-duplicates first.
 */
export async function addAntiPattern(input: AddAntiPatternInput): Promise<{
  antipattern: AntiPattern;
  duplicate_warning: string | null;
}> {
  // Check for near-duplicates using trigram similarity
  const dupCheck = await query(
    `SELECT id, title, similarity(title, $1) as sim
     FROM anti_patterns
     WHERE similarity(title, $1) > 0.6
     ORDER BY sim DESC
     LIMIT 3`,
    [input.title]
  );

  let duplicateWarning: string | null = null;
  if (dupCheck.rows.length > 0) {
    const dups = dupCheck.rows.map(
      (r: { id: string; title: string; sim: number }) =>
        `"${r.title}" (similarity: ${(r.sim * 100).toFixed(0)}%)`
    );
    duplicateWarning = `Potential duplicates found: ${dups.join(', ')}. Entry was still added — consider reviewing.`;
    console.error(`[AddAntiPattern] Duplicate warning: ${duplicateWarning}`);
  }

  const source = input.source || 'agent_discovered';
  const confidenceScore = input.confidence_score ?? CONFIDENCE_DEFAULTS[source] ?? 0.5;

  // Insert the new anti-pattern
  const insertResult = await query(
    `INSERT INTO anti_patterns (
      category, subcategory, cwe_id, owasp_category, severity,
      title, description, root_cause, bad_code, good_code,
      detection_hint, prevention_strategy,
      tech_stack, frameworks, domains, file_patterns,
      source, source_detail, confidence_score
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *`,
    [
      input.category,
      input.subcategory,
      input.cwe_id || null,
      input.owasp_category || null,
      input.severity,
      input.title,
      input.description,
      input.root_cause,
      input.bad_code,
      input.good_code,
      input.detection_hint,
      input.prevention_strategy,
      input.tech_stack,
      input.frameworks || [],
      input.domains || ['any'],
      input.file_patterns || [],
      source,
      input.source_detail || null,
      confidenceScore,
    ]
  );

  const newEntry = insertResult.rows[0] as AntiPattern;

  // Generate embedding asynchronously (don't block the response)
  const textForEmbedding = [
    input.title,
    input.description,
    input.root_cause,
    input.prevention_strategy,
    input.subcategory,
    input.tech_stack.join(', '),
  ].join(' | ');

  generateEmbedding(textForEmbedding)
    .then(async (embedding) => {
      if (embedding) {
        await query('UPDATE anti_patterns SET embedding = $1 WHERE id = $2', [
          `[${embedding.join(',')}]`,
          newEntry.id,
        ]);
        console.error(`[AddAntiPattern] Embedding generated for "${input.title}"`);
      }
    })
    .catch((err) => {
      console.error(`[AddAntiPattern] Embedding generation failed:`, (err as Error).message);
    });

  return {
    antipattern: newEntry,
    duplicate_warning: duplicateWarning,
  };
}
