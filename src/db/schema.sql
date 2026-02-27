-- ============================================================================
-- Negative Example Memory MCP Server — Database Schema
-- Fully idempotent: safe to run multiple times
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Custom Enum Types (use DO blocks for idempotency)
DO $$ BEGIN
    CREATE TYPE severity_level AS ENUM ('critical', 'high', 'medium', 'low', 'info');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE category_l1 AS ENUM (
        'security_vulnerability',
        'performance_issue',
        'architecture_smell',
        'database_antipattern',
        'devops_misconfiguration',
        'error_handling',
        'testing_gap',
        'data_integrity'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE source_type AS ENUM (
        'curated_seed',
        'static_analysis',
        'code_review',
        'developer_interview',
        'web_research',
        'agent_discovered'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE plan_status AS ENUM (
        'proposed',
        'critiqued',
        'refined',
        'approved',
        'rejected',
        'completed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Table: anti_patterns
-- ============================================================================
CREATE TABLE IF NOT EXISTS anti_patterns (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category              category_l1 NOT NULL,
    subcategory           TEXT NOT NULL,
    cwe_id                INTEGER,
    owasp_category        TEXT,
    severity              severity_level NOT NULL,
    title                 TEXT NOT NULL,
    description           TEXT NOT NULL,
    root_cause            TEXT NOT NULL,
    bad_code              TEXT NOT NULL,
    good_code             TEXT NOT NULL,
    detection_hint        TEXT NOT NULL,
    prevention_strategy   TEXT NOT NULL,
    tech_stack            TEXT[] NOT NULL DEFAULT '{}',
    frameworks            TEXT[] NOT NULL DEFAULT '{}',
    domains               TEXT[] NOT NULL DEFAULT '{}',
    file_patterns         TEXT[] NOT NULL DEFAULT '{}',
    source                source_type NOT NULL DEFAULT 'curated_seed',
    source_detail         TEXT,
    confidence_score      FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    validated_by_developer BOOLEAN NOT NULL DEFAULT FALSE,
    developer_context     TEXT,
    embedding             vector(1024),
    search_tsv            tsvector,
    times_surfaced        INTEGER NOT NULL DEFAULT 0,
    times_helpful         INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Table: planning_sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS planning_sessions (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_description      TEXT NOT NULL,
    task_module           TEXT,
    tech_stack            TEXT[] NOT NULL DEFAULT '{}',
    initial_plan          TEXT NOT NULL,
    matched_antipatterns  UUID[] NOT NULL DEFAULT '{}',
    match_scores          FLOAT[] NOT NULL DEFAULT '{}',
    critique              TEXT,
    critique_references   UUID[] NOT NULL DEFAULT '{}',
    risk_score            FLOAT,
    risks_identified      JSONB,
    refined_plan          TEXT,
    refinement_summary    TEXT,
    status                plan_status NOT NULL DEFAULT 'proposed',
    coding_started        BOOLEAN NOT NULL DEFAULT FALSE,
    outcome_notes         TEXT,
    outcome_score         FLOAT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    critiqued_at          TIMESTAMPTZ,
    refined_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ
);

-- ============================================================================
-- Table: interview_responses
-- ============================================================================
CREATE TABLE IF NOT EXISTS interview_responses (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id              UUID NOT NULL,
    question_category       TEXT NOT NULL,
    question_text           TEXT NOT NULL,
    developer_response      TEXT NOT NULL,
    generated_antipattern_id UUID REFERENCES anti_patterns(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Table: tool_invocations (logging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_invocations (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_name         TEXT NOT NULL,
    input_summary     TEXT NOT NULL DEFAULT '',
    output_summary    TEXT NOT NULL DEFAULT '',
    duration_ms       INTEGER NOT NULL DEFAULT 0,
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- HNSW index on embedding for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_antipatterns_embedding
    ON anti_patterns USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- GIN index on search_tsv for full-text search
CREATE INDEX IF NOT EXISTS idx_antipatterns_search_tsv
    ON anti_patterns USING gin (search_tsv);

-- GIN trigram index on title for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_antipatterns_title_trgm
    ON anti_patterns USING gin (title gin_trgm_ops);

-- GIN indexes on array columns for containment queries
CREATE INDEX IF NOT EXISTS idx_antipatterns_tech_stack
    ON anti_patterns USING gin (tech_stack);

CREATE INDEX IF NOT EXISTS idx_antipatterns_frameworks
    ON anti_patterns USING gin (frameworks);

CREATE INDEX IF NOT EXISTS idx_antipatterns_domains
    ON anti_patterns USING gin (domains);

-- Composite index on category + severity for filtered queries
CREATE INDEX IF NOT EXISTS idx_antipatterns_category_severity
    ON anti_patterns (category, severity);

-- Index on planning_sessions for status-based queries
CREATE INDEX IF NOT EXISTS idx_sessions_status_created
    ON planning_sessions (status, created_at DESC);

-- ============================================================================
-- Trigger: auto-update search_tsv on INSERT/UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION update_antipattern_search_tsv()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_tsv :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.root_cause, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.prevention_strategy, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.subcategory, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.detection_hint, '')), 'D');
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_antipattern_search_tsv ON anti_patterns;
CREATE TRIGGER trg_antipattern_search_tsv
    BEFORE INSERT OR UPDATE ON anti_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_antipattern_search_tsv();

-- ============================================================================
-- Function: search_antipatterns_hybrid (Reciprocal Rank Fusion)
-- ============================================================================
CREATE OR REPLACE FUNCTION search_antipatterns_hybrid(
    query_embedding     vector(1024),
    query_text          TEXT,
    stack_filter        TEXT[] DEFAULT NULL,
    domain_filter       TEXT[] DEFAULT NULL,
    severity_filter     severity_level[] DEFAULT NULL,
    category_filter     category_l1[] DEFAULT NULL,
    max_results         INT DEFAULT 10,
    rrf_k               INT DEFAULT 60
)
RETURNS TABLE (
    id                    UUID,
    category              category_l1,
    subcategory           TEXT,
    cwe_id                INTEGER,
    owasp_category        TEXT,
    severity              severity_level,
    title                 TEXT,
    description           TEXT,
    root_cause            TEXT,
    bad_code              TEXT,
    good_code             TEXT,
    detection_hint        TEXT,
    prevention_strategy   TEXT,
    tech_stack            TEXT[],
    frameworks            TEXT[],
    domains               TEXT[],
    file_patterns         TEXT[],
    source                source_type,
    source_detail         TEXT,
    confidence_score      FLOAT,
    validated_by_developer BOOLEAN,
    developer_context     TEXT,
    embedding             vector(1024),
    search_tsv            tsvector,
    times_surfaced        INTEGER,
    times_helpful         INTEGER,
    created_at            TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ,
    semantic_rank         BIGINT,
    keyword_rank          BIGINT,
    rrf_score             FLOAT
)
AS $$
BEGIN
    RETURN QUERY
    WITH base_filter AS (
        SELECT ap.*
        FROM anti_patterns ap
        WHERE
            (stack_filter IS NULL OR ap.tech_stack && stack_filter)
            AND (domain_filter IS NULL OR ap.domains && domain_filter)
            AND (severity_filter IS NULL OR ap.severity = ANY(severity_filter))
            AND (category_filter IS NULL OR ap.category = ANY(category_filter))
    ),
    semantic_arm AS (
        SELECT
            bf.id AS match_id,
            ROW_NUMBER() OVER (ORDER BY bf.embedding <=> query_embedding ASC) AS s_rank
        FROM base_filter bf
        WHERE bf.embedding IS NOT NULL
            AND query_embedding IS NOT NULL
    ),
    keyword_arm AS (
        SELECT
            bf.id AS match_id,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank(bf.search_tsv, websearch_to_tsquery('english', query_text)) DESC
            ) AS k_rank
        FROM base_filter bf
        WHERE bf.search_tsv @@ websearch_to_tsquery('english', query_text)
    ),
    fused AS (
        SELECT
            COALESCE(sa.match_id, ka.match_id) AS match_id,
            sa.s_rank,
            ka.k_rank,
            (COALESCE(1.0 / (rrf_k + sa.s_rank), 0) +
             COALESCE(1.0 / (rrf_k + ka.k_rank), 0))::double precision AS fused_score
        FROM semantic_arm sa
        FULL OUTER JOIN keyword_arm ka ON sa.match_id = ka.match_id
    )
    SELECT
        bf.id,
        bf.category,
        bf.subcategory,
        bf.cwe_id,
        bf.owasp_category,
        bf.severity,
        bf.title,
        bf.description,
        bf.root_cause,
        bf.bad_code,
        bf.good_code,
        bf.detection_hint,
        bf.prevention_strategy,
        bf.tech_stack,
        bf.frameworks,
        bf.domains,
        bf.file_patterns,
        bf.source,
        bf.source_detail,
        bf.confidence_score,
        bf.validated_by_developer,
        bf.developer_context,
        bf.embedding,
        bf.search_tsv,
        bf.times_surfaced,
        bf.times_helpful,
        bf.created_at,
        bf.updated_at,
        f.s_rank AS semantic_rank,
        f.k_rank AS keyword_rank,
        f.fused_score AS rrf_score
    FROM fused f
    JOIN base_filter bf ON bf.id = f.match_id
    ORDER BY f.fused_score DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
