import { query } from '../db/connection';
import { generateEmbedding } from './embedding';
import type { SearchResult, SearchFilters } from '../types';

/**
 * Hybrid search: vector similarity + full-text search with RRF fusion.
 * Falls back to keyword-only if embedding generation fails.
 */
export async function searchAntiPatterns(
  searchQuery: string,
  filters: SearchFilters = {}
): Promise<SearchResult[]> {
  const {
    tech_stack = null,
    domains = null,
    severity_filter = null,
    category_filter = null,
    max_results = parseInt(process.env.MAX_SEARCH_RESULTS || '10', 10),
  } = filters;

  // Generate embedding for hybrid search
  const embedding = await generateEmbedding(searchQuery);

  if (embedding) {
    // Full hybrid search using the database function
    try {
      const result = await query(
        `SELECT * FROM search_antipatterns_hybrid($1, $2, $3, $4, $5, $6, $7)`,
        [
          `[${embedding.join(',')}]`,
          searchQuery,
          tech_stack && tech_stack.length > 0 ? tech_stack : null,
          domains && domains.length > 0 ? domains : null,
          severity_filter && severity_filter.length > 0 ? severity_filter : null,
          category_filter && category_filter.length > 0 ? category_filter : null,
          max_results,
        ]
      );

      // Increment times_surfaced for all results
      if (result.rows.length > 0) {
        const ids = result.rows.map((r: SearchResult) => r.id);
        await query(
          `UPDATE anti_patterns SET times_surfaced = times_surfaced + 1 WHERE id = ANY($1)`,
          [ids]
        );
      }

      return result.rows as SearchResult[];
    } catch (err) {
      console.error('[Search] Hybrid search failed, falling back to keyword-only:', (err as Error).message);
      return keywordOnlySearch(searchQuery, filters, max_results);
    }
  }

  // Fallback to keyword-only search
  return keywordOnlySearch(searchQuery, filters, max_results);
}

/**
 * Keyword-only search fallback using full-text search and trigram matching.
 */
export async function keywordOnlySearch(
  searchQuery: string,
  filters: SearchFilters = {},
  limit: number = 10
): Promise<SearchResult[]> {
  const {
    tech_stack = null,
    domains = null,
    severity_filter = null,
    category_filter = null,
  } = filters;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Full-text search condition
  conditions.push(`(
    search_tsv @@ websearch_to_tsquery('english', $${paramIdx})
    OR similarity(title, $${paramIdx}) > 0.2
    OR description ILIKE '%' || $${paramIdx} || '%'
  )`);
  params.push(searchQuery);
  paramIdx++;

  // Apply filters
  if (tech_stack && tech_stack.length > 0) {
    conditions.push(`tech_stack && $${paramIdx}`);
    params.push(tech_stack);
    paramIdx++;
  }

  if (domains && domains.length > 0) {
    conditions.push(`domains && $${paramIdx}`);
    params.push(domains);
    paramIdx++;
  }

  if (severity_filter && severity_filter.length > 0) {
    conditions.push(`severity = ANY($${paramIdx}::severity_level[])`);
    params.push(severity_filter);
    paramIdx++;
  }

  if (category_filter && category_filter.length > 0) {
    conditions.push(`category = ANY($${paramIdx}::category_l1[])`);
    params.push(category_filter);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const sql = `
    SELECT
      *,
      NULL::bigint AS semantic_rank,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(search_tsv, websearch_to_tsquery('english', $1)) DESC,
                 similarity(title, $1) DESC
      ) AS keyword_rank,
      (ts_rank(search_tsv, websearch_to_tsquery('english', $1)) +
       similarity(title, $1)) AS rrf_score
    FROM anti_patterns
    ${whereClause}
    ORDER BY rrf_score DESC
    LIMIT $${paramIdx}
  `;

  params.push(limit);

  try {
    const result = await query(sql, params);

    // Increment times_surfaced
    if (result.rows.length > 0) {
      const ids = result.rows.map((r: SearchResult) => r.id);
      await query(
        `UPDATE anti_patterns SET times_surfaced = times_surfaced + 1 WHERE id = ANY($1)`,
        [ids]
      );
    }

    return result.rows as SearchResult[];
  } catch (err) {
    console.error('[Search] Keyword search also failed:', (err as Error).message);
    return [];
  }
}
