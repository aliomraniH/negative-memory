import { searchAntiPatterns as hybridSearch } from '../services/hybrid-search';
import type { SearchAntiPatternsInput, SearchResult } from '../types';

/**
 * Tool 2: search_antipatterns
 * Search the negative example database for anti-patterns relevant to a task.
 */
export async function searchAntiPatterns(input: SearchAntiPatternsInput): Promise<SearchResult[]> {
  const results = await hybridSearch(input.query, {
    tech_stack: input.tech_stack,
    domains: input.domains,
    severity_filter: input.severity_filter,
    category_filter: input.category_filter,
    max_results: input.max_results || 10,
  });

  return results;
}
