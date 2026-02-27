# Negative Example Memory MCP Server

A PostgreSQL-backed Model Context Protocol (MCP) server that stores coding anti-patterns, past mistakes, and failed approaches, then surfaces them during the planning phase of any coding task to prevent the AI agent from repeating known failures.

## Why This Exists

AI coding agents make the same mistakes repeatedly — SQL injection, missing auth, N+1 queries, hardcoded secrets. They have no memory of past failures. This server gives them that memory.

**The core loop**: Before writing code, query the anti-pattern database. Before committing to a plan, run it through the Judge for adversarial critique. Learn from every mistake permanently.

## Architecture

```
Task Description
     │
     ▼
┌─────────────────┐     ┌──────────────────────┐
│  seed_from_stack │────▶│  Anti-Pattern Database│
│  (detect stack)  │     │  (PostgreSQL+pgvector)│
└─────────────────┘     └──────────┬───────────┘
                                   │
     Plan                          │
     │                             │
     ▼                             ▼
┌─────────────────┐     ┌──────────────────────┐
│ search_antipatterns────▶│  Hybrid Search (RRF) │
│ (find relevant)  │     │  Vector + Full-Text   │
└─────────────────┘     └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │   THE JUDGE           │
                        │   (critique_plan)     │
                        │   Adversarial Critic  │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │   Refined Plan        │
                        │   + Risk Report       │
                        └──────────┬───────────┘
                                   │
                                   ▼
                              Write Code
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ with extensions: `uuid-ossp`, `pgvector`, `pg_trgm`
- Anthropic API key (for the Judge and semantic embeddings)

## Quick Start

### Replit

1. Import this repository into Replit
2. Set secrets in the Replit Secrets panel:
   - `DATABASE_URL` — your PostgreSQL connection string
   - `ANTHROPIC_API_KEY` — your Anthropic API key
3. Click Run — it will build and start automatically

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your database URL and Anthropic key

# 3. Set up the database schema
npm run setup-db

# 4. Load seed data (35 anti-patterns)
npm run seed

# 5. Build and start
npm run build
npm start
```

### Claude Desktop Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "negative-memory": {
      "command": "node",
      "args": ["/path/to/negative-memory-mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/negative_memory",
        "ANTHROPIC_API_KEY": "sk-ant-your-key"
      }
    }
  }
}
```

## Tools

### 1. `seed_from_stack`

Analyze a project description to detect technologies and return matching anti-patterns.

**When to use**: First thing when starting a new project.

```json
{
  "project_description": "FastAPI app with PostgreSQL for healthcare billing (HIPAA compliant)"
}
```

### 2. `search_antipatterns`

Search for anti-patterns relevant to a specific task.

**When to use**: Before writing any implementation plan.

```json
{
  "query": "implement user authentication with JWT tokens",
  "tech_stack": ["python", "fastapi"],
  "severity_filter": ["critical", "high"]
}
```

### 3. `add_antipattern`

Add a new anti-pattern to the database.

**When to use**: When discovering a new failure pattern during code review or debugging.

```json
{
  "category": "security_vulnerability",
  "subcategory": "session_fixation",
  "severity": "high",
  "title": "Session Fixation After Login",
  "description": "Not regenerating session ID after authentication allows attackers to fixate sessions.",
  "root_cause": "Session management library defaults to preserving session ID across login.",
  "bad_code": "# Login without session regeneration\nsession['user'] = user_id",
  "good_code": "# Regenerate session on login\nsession.regenerate()\nsession['user'] = user_id",
  "detection_hint": "Check login handlers for session.regenerate() or equivalent call.",
  "prevention_strategy": "Always regenerate session ID after privilege escalation (login, role change).",
  "tech_stack": ["python", "javascript"]
}
```

### 4. `critique_plan` (THE JUDGE)

Submit a coding plan for adversarial critique.

**When to use**: Before committing to any implementation plan.

```json
{
  "task_description": "Build patient data API endpoint",
  "plan": "1. Create GET /patients endpoint\n2. Query database\n3. Return JSON",
  "tech_stack": ["python", "fastapi", "postgresql"]
}
```

**Returns**: Risk score, individual risks with matched anti-patterns, verdict (approve/revise/reject), and fix suggestions.

### 5. `get_risk_profile`

Get a risk summary for a module or technology area.

```json
{
  "tech_stack": ["python", "postgresql"],
  "domains": ["healthcare"]
}
```

### 6. `validate_antipattern`

Developer confirms or rejects an anti-pattern's relevance.

```json
{
  "antipattern_id": "uuid-here",
  "is_relevant": true,
  "developer_notes": "Hit this exact issue last sprint"
}
```

### 7. `interview_developer`

Conduct a structured failure knowledge extraction session.

**Phase 1** — Generate questions:
```json
{
  "phase": "generate_questions",
  "tech_stack": ["python", "fastapi", "postgresql"],
  "domains": ["healthcare"]
}
```

**Phase 2** — Process a response:
```json
{
  "phase": "process_response",
  "session_id": "uuid-from-phase-1",
  "question_category": "security",
  "question_text": "Have you ever shipped a security vulnerability?",
  "developer_response": "Yes, we once logged full patient records including SSN...",
  "tech_stack": ["python"]
}
```

## Running the Hypothesis Test

The test script submits a deliberately flawed plan containing 7 known anti-patterns and measures how many the Judge catches:

```bash
npm run test-task
```

Expected output shows:
- Anti-patterns found by search
- Each risk identified by the Judge
- Detection rate (planted patterns caught)
- Timing metrics

## Database Schema

- **anti_patterns**: 35+ entries with embeddings, full-text search vectors, severity, tech stack
- **planning_sessions**: Tracks task → plan → critique → outcome lifecycle
- **interview_responses**: Developer interview answers linked to generated anti-patterns
- **tool_invocations**: Audit log of all MCP tool calls

## Phase 2 Roadmap

- Longitudinal outcome tracking (did the plan succeed after critique?)
- Automated CI/CD failure capture (learn from pipeline failures)
- Git hook integration (pre-commit anti-pattern scan)
- Multi-project support with shared knowledge base
- Confidence score decay over time
- Dashboard for anti-pattern analytics
