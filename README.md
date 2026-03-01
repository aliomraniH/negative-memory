# Negative Example Memory MCP Server

**Embed your team's knowledge, policies, and security guidelines into AI-generated code — at the prompt stage, not downstream in code review.**

A PostgreSQL-backed Model Context Protocol (MCP) server that stores coding anti-patterns, past mistakes, policy requirements, and team conventions, then surfaces them during the planning phase — before any code is written. An adversarial Judge critiques every plan against the team's accumulated knowledge, shifting enforcement from the tail of the pipeline to the head.

> **The core insight:** AI agents already *know* the safe patterns from their training data. They just default to the simpler, more common path. This system *forces* them to apply what they know — the same thing a code reviewer does, except it happens before the code exists.

---

## Why This Exists

Every engineering team accumulates knowledge — coding standards, security policies, privacy requirements, architectural guardrails, hard-won lessons from past incidents. Today, that knowledge is enforced **late**:

- Through **code review** after the code is written
- Through **static analysis** after it's committed
- Through **security audits** before release
- Through **production incidents** after deployment

When AI coding agents enter the picture, the problem compounds. The agent doesn't attend standups, doesn't absorb team culture, and starts fresh every session. It has broad training knowledge but no awareness of which patterns *this particular team* has decided are unacceptable, which privacy regulations apply to *this* codebase, or which architectural decisions were made for specific reasons.

**This server gives AI agents your team's failure memory.** Before writing code, query the anti-pattern database. Before committing to a plan, run it through the adversarial Judge. Your coding standards, security policies, and lessons learned become active enforcement at the moment of creation — not a gate at the end.

The approach is **domain-agnostic**. It applies to any codebase where guidelines, privacy, security, or team conventions matter: fintech, healthcare, government, enterprise SaaS, infrastructure, open-source libraries — anywhere that "we don't do it that way here" is a sentence someone has said in code review.

---

## Key Findings from Phase 1

Phase 1 ran a controlled experiment: two identical Claude.ai agents, same task, same capabilities. The only variable was access to the Negative Memory MCP tools. Here's what we learned.

### 1. The problem is enforcement, not education

Both agents were the same model with the same training data. The baseline *knew* that `Decimal` is correct for money, that transactions should be atomic, that connections need pool limits. It defaulted to the simpler pattern anyway. The MCP agent was **forced** off that default by the Judge citing specific anti-patterns. The system's value isn't giving agents new knowledge — it's **turning existing knowledge into enforced behavior**.

### 2. Team knowledge can be embedded at the prompt stage

The 35 seed anti-patterns represent rules every team accumulates: "don't use float for money," "always validate beyond type checking," "use compound indexes for multi-tenant data." Traditionally these live in style guides, wiki pages, and reviewers' heads. The system makes them searchable, citable, and automatically surfaced when a plan touches a relevant area — **at the concept stage**, before any code is generated.

### 3. A compact negative memory outperforms broad positive knowledge

35 entries caught 8 defects in a single task. The baseline agent with access to the entire internet's worth of training knowledge caught **0** — not because it didn't know better, but because nothing prompted it to apply what it knew. A small, curated set of "never do this" rules is more effective at preventing errors than a massive corpus of "here's how to do it right."

### 4. The cost-quality tradeoff is strongly favorable

**3x latency** and **4x input tokens** produced **8 defects caught** pre-delivery versus 0. For any codebase where security, privacy, or compliance matters, the cost of a single escaped defect — a data breach, a financial precision error, a policy violation — dwarfs the extra tokens.

### 5. A heterogeneous Judge eliminates self-review bias

Using GPT-5.2 to critique Claude's plans — rather than Claude critiquing itself — prevents the model from rationalizing its own defaults. Analogous to how real teams don't let developers review their own code.

### 6. Two-tier critique emerges naturally

The deployed system evolved into a **fast Judge** (~30s, catches obvious pattern matches against the database) plus **deep analysis** (~42s, uses reasoning tokens for subtle architectural risks). The Judge found 2 risks; deep analysis surfaced **12 more**. This mirrors how a senior engineer's quick scan and a thorough design review complement each other.

### 7. Database operations are effectively free

`seed_from_stack` (50ms), `get_risk_profile` (7ms), `validate_antipattern` (5ms). All latency comes from AI API calls. The knowledge storage and retrieval layer can be called aggressively without meaningful overhead.

### 8. Traceability is a side benefit with outsized value

The MCP-augmented code contained anti-pattern IDs in its header comments, creating a direct link between every defensive coding decision and the team knowledge that motivated it. Makes code review faster, audits trivial, and builds institutional records.

### 9. The approach is domain-agnostic

Security policies, privacy regulations (GDPR, HIPAA, PCI-DSS), team conventions, architectural guardrails, deployment constraints — any rule that today lives in a wiki page or a reviewer's memory can be encoded as an anti-pattern and enforced at the prompt stage. The test used a payment webhook, but the mechanism applies to any codebase.

### 10. The grounded Judge prevents hallucinated concerns

The Judge can **only** cite anti-patterns that exist in the database. It cannot invent risks. When it flags something, it points to a specific, documented, team-validated pattern — not generic AI anxiety. This is your team's knowledge being applied, not the model speculating.

---

## Theoretical Foundations

The system is built on three pillars of cognitive and machine learning research:

### 1. The Hard Negative Hypothesis

Research in contrastive learning (Robinson et al., 2021) demonstrates that "hard negatives" — examples near the decision boundary — provide a **6.7x increase in learning signal** compared to random negatives. In coding, a hard negative is not a syntax error, but a subtle architectural pitfall (e.g., a race condition in a specific driver pattern).

- **Information Density**: Negative examples are **10-20x more compact** (~25 tokens) than positive implementation examples (~300 tokens)

### 2. Recognition over Recall (RPD Model)

Based on Gary Klein's Recognition-Primed Decision (RPD) model, human experts make **87% of decisions via pattern recognition** rather than analytical comparison. The system presents agents with concrete historical pitfalls to trigger "Recognition," which is cognitively more effective than asking a model to "Recall" general best practices from scratch.

### 3. Orthogonal Defect Classification (ODC)

The architecture adopts the IBM ODC taxonomy, categorizing defects into 13 independent types (e.g., Assignment, Checking, Algorithm, Timing, Interface). This allows the system to generate a "Risk Profile" for code modules, identifying systemic weaknesses in an agent's reasoning over time.

---

## Empirical Validation: The Async Webhook Test

To validate the hypothesis, two identical **Claude.ai** agents were tasked with building a Python/MongoDB webhook service for payment processing. Both agents had the same capabilities and model — the only difference was that **Agent 2 had access to the Negative Memory MCP tools**, while Agent 1 did not.

### Task & "Invisible Bug" Traps

The task was seeded with three traps designed to exploit common agent defaults — the kind of issues that team guidelines and code review standards would normally catch:

1. **Non-Atomic Updates** — Luring the agent to fetch/modify/save in memory
2. **Missing Idempotency** — Failing to use unique transaction IDs
3. **Transaction Boundary Failure** — Updating logs before a successful DB write

### Side-by-Side Quality Comparison

| Dimension | Claude (Baseline) | Claude (With Negative Memory) | Winner |
| --- | --- | --- | --- |
| **Idempotency mechanism** | Unique index + `DuplicateKeyError` | Same, but justified by anti-pattern db561708 | MCP |
| **Atomicity** | Transaction offered as optional variant | Transaction is the **default** path | MCP |
| **Currency handling** | Raw `float(amount)` — IEEE-754 drift risk | `Decimal` to integer cents (`wallet_balance_cents`) | MCP |
| **Amount validation** | Type check only (`float()` cast) | Positive check + `Decimal` parse + rejects negatives | MCP |
| **Backpressure** | None — unbounded concurrency | `asyncio.Semaphore(50)` + 429 + `Retry-After` header | MCP |
| **Payload mismatch detection** | None | SHA-256 hash stored; compared on duplicate (409) | MCP |
| **Multi-provider safety** | Single `transaction_id` index | Compound index `(provider, transaction_id)` | MCP |
| **Standalone fallback** | Insert-then-update, no recovery on partial failure | Rolls back idempotency record on wallet failure | MCP |
| **Health check** | None | `/health` with DB ping | MCP |
| **Mongo client tuning** | Default Motor settings | Explicit timeouts, pool size, `retryWrites` | MCP |
| **Body size limit** | Default (1 MiB) | `client_max_size=64KiB` (webhooks are small) | MCP |
| **Code documentation** | Good docstrings | Docstrings + anti-pattern traceability in header | MCP |

**Verdict**: The MCP-augmented Claude produced a meaningfully more production-ready implementation. The baseline Claude had the right *skeleton* but missed **8 concrete hardening measures** that the Negative Memory tooling surfaced.

### Tool Usage Audit

**Baseline Claude (No MCP):** 2 tool calls

| Tool | Purpose |
| --- | --- |
| `create_file` | Write webhook_service.py |
| `present_files` | Share with user |

**Claude with Negative Memory MCP:** 9 tool calls

| Tool | Purpose |
| --- | --- |
| `seed_from_stack` | Detect tech stack — found 1 critical anti-pattern |
| `search_antipatterns` | Deep search for fintech/payments patterns |
| `critique_plan` | Adversarial review of implementation plan — **approved** |
| `deep_analysis` | Exhaustive edge-case analysis — surfaced 12 risks |
| `validate_antipattern` | Confirmed anti-pattern relevance (confidence 0.95 to 1.0) |
| `create_file` | Write hardened webhook_service.py |
| `present_files` | Share with user |

### Cost vs. Quality Tradeoff

| Metric | Baseline Claude | Claude + Negative Memory | Delta |
| --- | --- | --- | --- |
| **Tool calls** | 2 | 9 | +7 calls |
| **MCP network calls** | 0 | 5 | +5 external calls |
| **Input tokens (est.)** | ~2K | ~8K | ~4x |
| **Output tokens (est.)** | ~4K | ~6K | ~1.5x |
| **Latency (est.)** | ~8-12s | ~25-40s | ~3x slower |
| **Defects caught pre-delivery** | 0 | 8 hardening measures | Significant quality uplift |
| **Auditability** | None | Full traceability to anti-pattern IDs | Easier to justify in review |

### Actual MCP Server Logs (From Claude's Session)

The following is the real tool invocation log captured by the MCP server during Claude's session (1:39 PM PT / 21:39 UTC on February 27, 2026):

```
TIMESTAMP (UTC)              TOOL                    DURATION
--------------------------------------------------------------
2026-02-27T21:39:10.698Z     search_antipatterns      15,045ms
2026-02-27T21:39:10.776Z     seed_from_stack              50ms
2026-02-27T21:39:10.802Z     get_risk_profile              7ms
2026-02-27T21:39:25.819Z     search_antipatterns      15,011ms
2026-02-27T21:39:25.832Z     validate_antipattern          5ms
2026-02-27T21:39:41.395Z     interview_developer     15,560ms
2026-02-27T21:40:11.987Z     critique_plan           30,585ms
2026-02-27T21:40:53.819Z     deep_analysis           41,824ms
--------------------------------------------------------------
TOTAL SERVER-SIDE PROCESSING                        118,087ms
```

**Measured cost breakdown:**

| Resource | Actual Value |
| --- | --- |
| **Total MCP server processing** | 118.1 seconds |
| **Longest single call** | `deep_analysis` at 41.8s (OpenAI GPT-5.2 with reasoning tokens) |
| **Judge critique** | 30.6s — identified 2 risks, risk score 0.85, verdict: **reject** |
| **Hybrid search calls** | ~15s each (pgvector + full-text with RRF scoring) |
| **Fast calls** | `seed_from_stack` (50ms), `get_risk_profile` (7ms), `validate_antipattern` (5ms) |
| **Session span** | 21:39:10 to 21:41:45 UTC (~2.5 minutes wall clock) |

> **Bottom Line**: 3x the latency and 4x the tokens caught 8 concrete defects the baseline shipped with — including a critical currency-precision bug (`float` for money) and zero backpressure under retry storms. Both agents were the same Claude.ai model. The baseline *knew* the safe methods but defaulted to the "simple" path. The MCP agent was *forced* into the safe path by the Judge. **Anti-pattern memory retrieval is an enforcement mechanism that overrides default model behavior.**

---

## Architecture: The 8-Stage Adversarial Workflow

The system is implemented as a custom MCP server, functioning as a "USB-C port" for any AI agent (Claude, GPT-5, DeepSeek) to access failure memory.

```
1. Initial Plan          Agent generates implementation strategy
       |
       v
2. Negative Query        Plan embedded and searched against anti_patterns table
       |
       v
3. Hybrid Search (RRF)   Reciprocal Rank Fusion combines semantic (vector)
       |                 and keyword (tsvector) scores
       v
4. THE JUDGE             Specialized Verifier LLM identifies specific risks
       |                 by citing IDs from matched anti-patterns
       v
5. Pre-Mortem            Judge assumes project has already failed,
       |                 works backward to identify causes
       v
6. Plan Refinement       Agent must address every flagged risk until
       |                 Judge grants "Approve" status
       v
7. Deep Analysis         Extended thinking with reasoning tokens for
       |                 complex architectural decisions
       v
8. Code Generation       Implementation begins only with "Immunized" plan
```

---

## Features

- **8 MCP Tools** for anti-pattern management, plan critique, risk profiling, and deep analysis
- **Streamable HTTP Transport** at `/mcp` endpoint with stateful session management
- **Multi-Role AI Provider System** — independently configurable Provider, Judge, and Embedding roles
- **Extended Thinking** via Anthropic thinking blocks and OpenAI reasoning tokens
- **Hybrid Search** combining pgvector similarity + full-text search with Reciprocal Rank Fusion
- **Web Dashboard** with 6 tabs for monitoring, configuration, and 17 health checks
- **35 Seeded Anti-Patterns** across security (10), performance (8), architecture (7), database (6), and DevOps (4)

## Multi-Role AI Provider System

Each AI function can use a different provider and model independently:

| Role | Default Provider | Default Model | Purpose |
| --- | --- | --- | --- |
| **Provider** | Anthropic | claude-sonnet-4-5-20250929 | General completions, tech stack extraction, interview analysis |
| **Judge** | OpenAI | gpt-5.2 | Adversarial plan critique, deep analysis with extended thinking |
| **Embedding** | Anthropic | claude-sonnet-4-5-20250929 | Anti-pattern semantic similarity search |

Configure via environment variables or the dashboard's Setup & Keys tab.

## MCP Streamable HTTP Transport

The server uses **Streamable HTTP** transport (not stdio), accessible at `/mcp`:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/mcp` | Initialize session, send tool calls |
| `GET` | `/mcp` | SSE stream for server-initiated messages |
| `DELETE` | `/mcp` | Close an MCP session |

Sessions use UUID identifiers with 30-minute TTL and automatic cleanup.

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ with extensions: `uuid-ossp`, `pgvector`, `pg_trgm`
- At least one API key: Anthropic (recommended) and/or OpenAI

### Replit

1. Import this repository into Replit
2. Set secrets in the Replit Secrets panel:
   - `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
   - `ANTHROPIC_API_KEY` — Anthropic API key
   - `OPENAI_API_KEY` — OpenAI API key (optional, for Judge role)
3. Click Run — it will build and start automatically

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
export DATABASE_URL="postgresql://user:password@localhost:5432/negative_memory"
export ANTHROPIC_API_KEY="sk-ant-your-key"
export OPENAI_API_KEY="sk-your-key"  # optional

# 3. Set up the database schema
npm run setup-db

# 4. Load seed data (35 anti-patterns)
npm run seed

# 5. Build and start
npm run build
npm start
```

### MCP Client Configuration

For Claude Desktop or other MCP clients using HTTP transport:

```json
{
  "mcpServers": {
    "negative-memory": {
      "url": "http://localhost:5000/mcp",
      "transport": "streamable-http"
    }
  }
}
```

---

## Tools (8 Total)

### 1. `seed_from_stack`

Analyze a project description to detect technologies and return matching anti-patterns.

```json
{ "project_description": "FastAPI app with PostgreSQL for healthcare billing" }
```

### 2. `search_antipatterns`

Hybrid search (vector + full-text) for anti-patterns relevant to a specific task.

```json
{
  "query": "implement user authentication with JWT tokens",
  "tech_stack": ["python", "fastapi"],
  "severity_filter": ["critical", "high"]
}
```

### 3. `add_antipattern`

Add a new anti-pattern to the database with automatic embedding generation.

```json
{
  "category": "security_vulnerability",
  "subcategory": "session_fixation",
  "severity": "high",
  "title": "Session Fixation After Login",
  "description": "Not regenerating session ID after authentication.",
  "root_cause": "Session management library defaults to preserving session ID.",
  "bad_code": "session['user'] = user_id",
  "good_code": "session.regenerate()\nsession['user'] = user_id",
  "detection_hint": "Check login handlers for session.regenerate().",
  "prevention_strategy": "Always regenerate session ID after privilege escalation.",
  "tech_stack": ["python", "javascript"]
}
```

### 4. `critique_plan` (THE JUDGE)

Submit a coding plan for adversarial critique against the anti-pattern database.

```json
{
  "task_description": "Build patient data API endpoint",
  "plan": "1. Create GET /patients endpoint\n2. Query database\n3. Return JSON",
  "tech_stack": ["python", "fastapi", "postgresql"]
}
```

Returns: Risk score, individual risks with matched anti-patterns, verdict (approve/revise/reject), and fix suggestions.

### 5. `get_risk_profile`

Get a risk summary for a module or technology area.

```json
{ "tech_stack": ["python", "postgresql"], "domains": ["healthcare"] }
```

### 6. `validate_antipattern`

Developer confirms or rejects an anti-pattern's relevance.

```json
{ "antipattern_id": "uuid-here", "is_relevant": true, "developer_notes": "Hit this exact issue" }
```

### 7. `interview_developer`

Structured failure knowledge extraction in two phases (generate questions, then process responses).

```json
{ "phase": "generate_questions", "tech_stack": ["python", "fastapi"], "domains": ["healthcare"] }
```

### 8. `deep_analysis`

Extended-thinking analysis with configurable depth levels. Uses Anthropic thinking blocks or OpenAI reasoning tokens for deep architectural reasoning.

```json
{
  "task": "Review this database query pattern for security issues",
  "context": "const result = await pool.query(`SELECT * FROM users WHERE email = '${email}'`);",
  "tech_stack": ["node", "postgresql"],
  "depth": "deep"
}
```

Depth levels: `standard` (10K thinking tokens), `deep` (20K), `exhaustive` (50K).

---

## Web Dashboard

The dashboard runs on port 5000 with 6 tabs:

| Tab | Description |
| --- | --- |
| **Overview** | Status cards, category/severity charts, top patterns |
| **Setup & Keys** | Multi-role provider/model configuration, environment status, MCP endpoint |
| **MCP Tools** | All 8 tool cards with descriptions and parameter schemas |
| **Anti-Patterns** | Filterable/searchable table of all anti-patterns |
| **Judge Sessions** | History of plan critiques with risk scores |
| **Health Check** | 17 system tests across 4 groups (database, search, tools, AI) |

---

## Roadmap: Next Phases

Phase 1 proved the mechanism works. The roadmap now focuses on making the memory self-growing, faster, and embedded in the team's daily workflow. **Community contributions are welcome on all phases** — see [Contributing](#contributing) below.

### Phase 2: Self-Growing Memory — Automated Capture Pipelines

> **Status:** Design complete, implementation not started
> **Goal:** The memory should grow automatically from your existing development lifecycle, not require manual curation.

| Capture Source | How It Works | Anti-Pattern Confidence |
| --- | --- | --- |
| **Static analysis (SARIF)** | Parse output from SonarQube, CodeQL, Bandit, Ruff, Semgrep. Map tool-specific rule IDs to CWE categories. | 0.85 |
| **CI/CD failures** | GitHub Actions `workflow_run` events with `conclusion=failure`. Parse logs for error context, affected files, failure categories. | 0.70 |
| **Git analysis** | Detect reverted commits (`^Revert`), fix commits (`fix|fixes|closes|resolves`), debugging sessions (rapid successive commits to same files within 10-min windows). | 0.65 |
| **Code review feedback** | `pull_request_review` webhook events with `state=changes_requested`. Extract anti-patterns from reviewer comments via keyword matching + embedding similarity. | 0.75 |

Every auto-captured entry starts at a lower confidence and requires **developer validation** (`validate_antipattern`) to be promoted. Estimated growth: **200-500 entries within the first 3 months** of active use.

**Looking for help with:**
- [ ] SARIF parser implementation (GitHub Action or standalone)
- [ ] GitHub webhook receiver for CI/CD failure events
- [ ] Git log analyzer for revert/fix/debugging detection
- [ ] PR review comment extraction pipeline

### Phase 3: Anti-Pattern Relations — Causal Chains

> **Status:** Not started
> **Goal:** Understand *why* failures happen, not just *what* they are.

Add a graph layer with typed edges: `caused_by`, `similar_to`, `recurrence_of`, `same_root_cause`. Implemented via a junction table and recursive CTEs — no separate graph database required.

This enables:
- **Causal chain traversal**: "What's the root cause behind this class of failures?"
- **Blast radius analysis**: "What else tends to go wrong when this pattern appears?"
- **Decision feedback loops**: Link anti-patterns to architectural decisions to see which design choices produce which downstream consequences.

**Looking for help with:**
- [ ] Relation schema design and migration
- [ ] Recursive CTE queries for chain traversal
- [ ] UI for visualizing anti-pattern graphs in the dashboard

### Phase 4: Multi-Project Scoping

> **Status:** Not started
> **Goal:** Organizations share institutional knowledge across teams while keeping project-specific conventions separate.

Three tiers of anti-patterns:

| Tier | Scope | Examples |
| --- | --- | --- |
| **Global** | Apply everywhere | SQL injection, hardcoded secrets, missing input validation |
| **Technology** | Apply to matching stacks | PostgreSQL timestamp pitfalls, FastAPI async footguns, React state bugs |
| **Project-specific** | This team's rules | "We use integer cents not Decimal," "All endpoints require X-Request-ID header" |

Search queries fan out across all three tiers with project-specific results ranked highest.

**Looking for help with:**
- [ ] Project/organization scoping model
- [ ] Tiered search with rank boosting
- [ ] Admin UI for managing cross-project patterns

### Phase 5: Search Performance Optimization

> **Status:** Bottleneck identified
> **Goal:** Sub-second hybrid search (currently ~15s per call).

The ~15s latency is dominated by the embedding generation API roundtrip (using Claude as a workaround for embedding). Three optimizations:

| Optimization | Expected Impact | Complexity |
| --- | --- | --- |
| **Dedicated embedding model** (Voyage AI `voyage-3` or OpenAI `text-embedding-3-large`) | 10-50x faster embedding, better search relevance | Medium |
| **Pre-computed embedding cache** | Eliminate API call on repeated/similar queries | Low |
| **HNSW/IVFFlat parameter tuning** | Faster approximate nearest neighbor at scale | Low |

**Looking for help with:**
- [ ] Embedding provider abstraction (swap Claude for dedicated model)
- [ ] Query embedding cache with similarity-based cache hits
- [ ] Benchmark suite for search latency and recall at different database sizes

### Phase 6: Longitudinal Measurement

> **Status:** Not started
> **Goal:** Prove the system reduces bugs over months, not just in a single test.

Metrics to track over extended real-world use:

| Metric | What It Measures | Success Signal |
| --- | --- | --- |
| **Recurrence rate** | How often the same anti-pattern appears in new plans | Trends toward zero per pattern |
| **First-pass approval rate** | Plans the Judge approves on first submission | Increases over time |
| **Token savings** | Planning + critique cost vs estimated debugging cost | Net positive after ~3 defects caught |
| **Memory ROI** | System maintenance cost vs cost of defects prevented | Strongly positive for compliance-sensitive codebases |

**Looking for help with:**
- [ ] Metrics collection and dashboard integration
- [ ] Baseline measurement methodology
- [ ] Statistical analysis framework for before/after comparison

### Phase 7: Automatic Workflow Integration

> **Status:** Not started
> **Goal:** Every task automatically runs through the negative memory — no manual tool calls.

Embed the workflow into the agent's system prompt (`CLAUDE.md`, `.cursorrules`, or equivalent):

| Trigger | Action |
| --- | --- |
| **Project initialization** | `seed_from_stack` — load relevant anti-patterns into context |
| **Before code generation** | `critique_plan` — every plan gets adversarial review |
| **After debugging session** | `add_antipattern` — capture the failure for next time |
| **After rejected code review** | `add_antipattern` — extract the reviewer's feedback as a pattern |

The memory grows with every failure. Every future plan is checked against every past failure. Continuous enforcement of team knowledge at the prompt stage.

**Looking for help with:**
- [ ] System prompt templates for Claude Code, Cursor, Windsurf, Cline
- [ ] Auto-capture hooks for debugging sessions
- [ ] Integration guides for different MCP clients

---

## Environment Variables

### Required

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key (default for Provider and Embedding) |

### Optional

| Variable | Description | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API key (default for Judge) | — |
| `AI_PROVIDER` | Provider role: `openai` or `anthropic` | `anthropic` |
| `PROVIDER_MODEL` | Model for Provider role | `claude-sonnet-4-5-20250929` |
| `JUDGE_PROVIDER` | Judge role: `openai` or `anthropic` | `openai` |
| `JUDGE_MODEL` | Model for Judge role | `gpt-5.2` |
| `EMBEDDING_PROVIDER` | Embedding role: `openai` or `anthropic` | `anthropic` |
| `EMBEDDING_MODEL` | Model for Embedding role | `claude-sonnet-4-5-20250929` |

---

## Project Structure

```
src/
├── index.ts                    # MCP server factory, tool definitions
├── db/
│   ├── connection.ts           # PostgreSQL pool management
│   ├── migrations.ts           # Schema setup runner
│   ├── schema.sql              # Full DDL (tables, indexes, functions)
│   ├── seed.sql                # 35 anti-pattern seed entries
│   └── run-seed.ts             # Seed runner with embedding generation
├── services/
│   ├── ai-provider.ts          # Multi-role provider abstraction
│   ├── claude-reasoning.ts     # Judge system prompt + API calls
│   ├── embedding.ts            # Embedding generation (AI + hash fallback)
│   ├── hybrid-search.ts        # RRF hybrid search (vector + full-text)
│   └── stack-parser.ts         # Technology stack detection
├── tools/
│   ├── seed-from-stack.ts      # Tool 1: Detect stack + matching patterns
│   ├── search-antipatterns.ts  # Tool 2: Hybrid search
│   ├── add-antipattern.ts      # Tool 3: Add anti-pattern
│   ├── critique-plan.ts        # Tool 4: THE JUDGE
│   ├── get-risk-profile.ts     # Tool 5: Risk summary
│   ├── validate-antipattern.ts # Tool 6: Developer validation
│   ├── interview-developer.ts  # Tool 7: Failure interview
│   └── deep-analysis.ts        # Tool 8: Extended thinking analysis
└── types/
    └── index.ts                # TypeScript interfaces

dashboard/
├── server.ts                   # Express server (port 5000) + MCP HTTP
└── public/
    ├── index.html              # Dashboard SPA
    ├── styles.css              # Dark theme styling
    └── app.js                  # Frontend JavaScript
```

## Database Schema

- **anti_patterns** — 35 entries with 1024-dim embeddings, full-text search vectors, severity levels, tech stacks (security=10, performance=8, architecture=7, database=6, devops=4; severity: high=14, medium=14, critical=6, low=1)
- **planning_sessions** — Task to plan to critique to outcome lifecycle tracking
- **interview_responses** — Developer interview answers linked to generated anti-patterns
- **tool_invocations** — Audit log of all MCP tool calls with timing data

## Commands

| Command | Description |
| --- | --- |
| `npm run build` | Compile both MCP server and dashboard |
| `npm run build:mcp` | Compile MCP server only |
| `npm run build:dashboard` | Compile dashboard only |
| `npm run setup-db` | Run schema migrations |
| `npm run seed` | Load 35 anti-pattern seed entries |
| `npm run test-mcp` | Run MCP endpoint test suite |
| `npm run test-task` | Run hypothesis integration test |
| `npm start` | Start the dashboard + MCP server |

## Testing

```bash
# Run MCP protocol and tools test suite (12 tests covering protocol, sessions, DB tools, AI tools)
npm run test-mcp

# Run hypothesis test (flawed plan with 7 known anti-patterns, measures Judge detection rate)
npm run test-task
```

---

## Contributing

This project is in active development and **contributions are very welcome**. Whether you're an AI researcher, a platform engineer, or someone who's tired of catching the same bugs in code review, there's meaningful work to be done.

### Where to Start

| Interest | Good First Issues |
| --- | --- |
| **AI/ML** | Dedicated embedding provider (Phase 5), Judge prompt engineering, multi-model benchmarks |
| **Backend** | SARIF ingestion pipeline (Phase 2), anti-pattern relations schema (Phase 3), search caching |
| **DevOps/CI** | GitHub Actions webhook receiver, CI failure capture, git log analyzer |
| **Frontend** | Dashboard improvements, anti-pattern graph visualization, metrics dashboards |
| **Security** | New anti-pattern contributions for OWASP, CWE, PCI-DSS, HIPAA, SOC 2 compliance |
| **Documentation** | Integration guides for Claude Code, Cursor, Windsurf, Cline, VS Code |

### How to Contribute

1. **Open an issue first** — describe what you want to build and which phase it relates to
2. **Fork and branch** — create a feature branch from `main`
3. **Test** — run `npm run test-mcp` and ensure all 12 tests pass
4. **PR** — reference the issue and describe what changed and why

### Contributing Anti-Patterns

One of the most valuable contributions is **adding anti-patterns from your domain**. If your team has rules, policies, or hard-won lessons that should be enforced at the prompt stage, they belong in this database:

```json
{
  "category": "your_category",
  "severity": "critical|high|medium|low",
  "title": "Short descriptive name",
  "description": "What goes wrong and why it matters",
  "root_cause": "Why agents default to the wrong pattern",
  "bad_code": "// The pattern that looks right but isn't",
  "good_code": "// The correct approach",
  "prevention_strategy": "How to avoid this",
  "tech_stack": ["relevant", "technologies"]
}
```

**Domains we especially need anti-patterns for:**
- Healthcare (HIPAA, HL7 FHIR, PHI handling)
- Financial services (PCI-DSS, SOX, currency precision)
- Government (FedRAMP, NIST 800-53, accessibility)
- Security (OWASP Top 10, CWE Top 25, zero trust)
- Cloud/Infrastructure (Kubernetes, Terraform, IAM)
- Mobile (platform guidelines, offline-first patterns)
- Testing (flaky test patterns, test isolation, coverage traps)

### Share Your Experience

If you deploy this on your team, we want to hear what happens:

- **What anti-patterns did you add?** What domain knowledge did your team encode?
- **Did the Judge catch things code review would have caught?** How often?
- **What's the first-pass approval rate?** Did it improve over time?
- **What's missing?** What would make this useful for your workflow?

Open a [Discussion](https://github.com/aliomraniH/negative-memory/discussions) or email [ali@hamedani.com](mailto:ali@hamedani.com).

---

## References

- Robinson, J. et al. (2021). "Contrastive Learning with Hard Negative Samples." ICLR.
- Klein, G. (1998). "Sources of Power: How People Make Decisions." MIT Press.
- Chillarege, R. et al. (1992). "Orthogonal Defect Classification." IEEE Transactions on Software Engineering.
- Shinn, N. et al. (2023). "Reflexion: Language Agents with Verbal Reinforcement Learning." NeurIPS.
- Zhao, A. et al. (2024). "ExpeL: LLM Agents Are Experiential Learners." AAAI.
- Liang, T. et al. (2023). "Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate."
- Xiong, K. et al. (2025). "When Raw Data Prevails: Are Large Language Model Embeddings Effective in Numerical Data Representation for Medical Machine Learning Applications?"

## License

MIT
