// ============================================================================
// Negative Example Memory MCP Server — Type Definitions
// ============================================================================

// --- Enum Types (matching PostgreSQL enums) ---

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type CategoryL1 =
  | 'security_vulnerability'
  | 'performance_issue'
  | 'architecture_smell'
  | 'database_antipattern'
  | 'devops_misconfiguration'
  | 'error_handling'
  | 'testing_gap'
  | 'data_integrity';

export type SourceType =
  | 'curated_seed'
  | 'static_analysis'
  | 'code_review'
  | 'developer_interview'
  | 'web_research'
  | 'agent_discovered';

export type PlanStatus =
  | 'proposed'
  | 'critiqued'
  | 'refined'
  | 'approved'
  | 'rejected'
  | 'completed';

// --- Core Database Row Types ---

export interface AntiPattern {
  id: string;
  category: CategoryL1;
  subcategory: string;
  cwe_id: number | null;
  owasp_category: string | null;
  severity: SeverityLevel;
  title: string;
  description: string;
  root_cause: string;
  bad_code: string;
  good_code: string;
  detection_hint: string;
  prevention_strategy: string;
  tech_stack: string[];
  frameworks: string[];
  domains: string[];
  file_patterns: string[];
  source: SourceType;
  source_detail: string | null;
  confidence_score: number;
  validated_by_developer: boolean;
  developer_context: string | null;
  embedding: number[] | null;
  search_tsv?: unknown;
  times_surfaced: number;
  times_helpful: number;
  created_at: Date;
  updated_at: Date;
}

export interface PlanningSession {
  id: string;
  task_description: string;
  task_module: string | null;
  tech_stack: string[];
  initial_plan: string;
  matched_antipatterns: string[];
  match_scores: number[];
  critique: string | null;
  critique_references: string[];
  risk_score: number | null;
  risks_identified: RiskItem[] | null;
  refined_plan: string | null;
  refinement_summary: string | null;
  status: PlanStatus;
  coding_started: boolean;
  outcome_notes: string | null;
  outcome_score: number | null;
  created_at: Date;
  critiqued_at: Date | null;
  refined_at: Date | null;
  completed_at: Date | null;
}

export interface InterviewResponse {
  id: string;
  session_id: string;
  question_category: string;
  question_text: string;
  developer_response: string;
  generated_antipattern_id: string | null;
  created_at: Date;
}

export interface ToolInvocation {
  id: string;
  tool_name: string;
  input_summary: string;
  output_summary: string;
  duration_ms: number;
  error_message: string | null;
  created_at: Date;
}

// --- Search & Judge Result Types ---

export interface SearchResult extends AntiPattern {
  semantic_rank: number | null;
  keyword_rank: number | null;
  rrf_score: number;
}

export interface RiskItem {
  risk_title: string;
  plan_excerpt: string;
  matched_antipattern_id: string;
  matched_antipattern_title: string;
  explanation: string;
  suggested_fix: string;
  severity: SeverityLevel;
}

export interface JudgeCritique {
  overall_risk_score: number;
  risks: RiskItem[];
  safe_aspects: string[];
  refined_plan_suggestions: string[];
  verdict: 'approve' | 'revise' | 'reject';
}

// --- Tool Input Types ---

export interface SeedFromStackInput {
  project_description: string;
  project_path?: string;
}

export interface SearchAntiPatternsInput {
  query: string;
  tech_stack?: string[];
  domains?: string[];
  severity_filter?: SeverityLevel[];
  category_filter?: CategoryL1[];
  max_results?: number;
}

export interface AddAntiPatternInput {
  category: CategoryL1;
  subcategory: string;
  severity: SeverityLevel;
  title: string;
  description: string;
  root_cause: string;
  bad_code: string;
  good_code: string;
  detection_hint: string;
  prevention_strategy: string;
  tech_stack: string[];
  frameworks?: string[];
  domains?: string[];
  file_patterns?: string[];
  cwe_id?: number;
  owasp_category?: string;
  source?: SourceType;
  source_detail?: string;
  confidence_score?: number;
}

export interface CritiquePlanInput {
  task_description: string;
  plan: string;
  tech_stack?: string[];
  task_module?: string;
  code_context?: string;
}

export interface ValidateAntiPatternInput {
  antipattern_id: string;
  is_relevant: boolean;
  developer_notes?: string;
  severity_override?: SeverityLevel;
}

export interface GetRiskProfileInput {
  module?: string;
  tech_stack?: string[];
  domains?: string[];
}

export interface InterviewDeveloperInput {
  phase: 'generate_questions' | 'process_response';
  tech_stack?: string[];
  domains?: string[];
  session_id?: string;
  question_category?: string;
  question_text?: string;
  developer_response?: string;
}

// --- Tool Output Types ---

export interface SeedFromStackOutput {
  detected_stack: {
    tech_stack: string[];
    frameworks: string[];
    domains: string[];
  };
  matching_antipatterns: AntiPattern[];
  risk_briefing: string;
  total_matches: number;
}

export interface CritiquePlanOutput {
  session_id: string;
  critique: JudgeCritique;
  antipatterns_consulted: number;
  antipatterns_matched: number;
}

export interface ValidateAntiPatternOutput {
  antipattern_id: string;
  title: string;
  before: { confidence_score: number; severity: SeverityLevel };
  after: { confidence_score: number; severity: SeverityLevel };
  developer_notes: string | null;
}

export interface InterviewOutput {
  session_id: string;
  phase: 'questions_generated' | 'response_processed';
  questions?: { category: string; question: string }[];
  generated_antipattern?: AntiPattern | null;
  message: string;
}

export interface RiskProfileOutput {
  summary: {
    total_antipatterns: number;
    by_category: Record<string, number>;
    by_severity: Record<string, number>;
  };
  top_risks: AntiPattern[];
  recent_sessions: PlanningSession[];
}

// --- Confidence Score Defaults ---

export const CONFIDENCE_DEFAULTS: Record<SourceType, number> = {
  curated_seed: 0.90,
  static_analysis: 0.85,
  code_review: 0.80,
  developer_interview: 0.70,
  web_research: 0.60,
  agent_discovered: 0.50,
};

// --- Search Filter Type ---

export interface SearchFilters {
  tech_stack?: string[];
  domains?: string[];
  severity_filter?: SeverityLevel[];
  category_filter?: CategoryL1[];
  max_results?: number;
}
