# Negative Example Memory MCP Server

A PostgreSQL-backed Model Context Protocol (MCP) server that stores coding anti-patterns, past mistakes, and failed approaches, then surfaces them during the planning phase of any coding task to prevent AI agents from repeating known failures.

## Why This Exists

AI coding agents make the same mistakes repeatedly — SQL injection, missing auth, N+1 queries, hardcoded secrets. They have no memory of past failures. This server gives them that memory.

**The core loop**: Before writing code, query the anti-pattern database. Before committing to a plan, run it through the Judge for adversarial critique. Learn from every mistake permanently.

## Features

- **8 MCP Tools** for anti-pattern management, plan critique, risk profiling, and deep analysis
- **Streamable HTTP Transport** at `/mcp` endpoint with session management
- **Multi-Role AI Provider System** — independently configurable Provider, Judge, and Embedding roles
- **Extended Thinking** via Anthropic thinking blocks and OpenAI reasoning tokens
- **Hybrid Search** combining pgvector similarity + full-text search with Reciprocal Rank Fusion
- **Web Dashboard** with 6 tabs for monitoring, configuration, and health checks
- **35 Seeded Anti-Patterns** across security, performance, architecture, database, and DevOps

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
                        │   deep_analysis       │
                        │   Extended Thinking   │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │   Refined Plan        │
                        │   + Risk Report       │
                        └──────────────────────┘
```

## Multi-Role AI Provider System

Each AI function can use a different provider and model independently:

| Role | Default Provider | Default Model | Purpose |
|------|-----------------|---------------|---------|
| **Provider** | Anthropic | claude-sonnet-4-5-20250929 | General completions, tech stack extraction, interview analysis |
| **Judge** | OpenAI | gpt-5.2 | Adversarial plan critique, deep analysis with extended thinking |
| **Embedding** | Anthropic | claude-sonnet-4-5-20250929 | Anti-pattern semantic similarity search |

Configure via environment variables or the dashboard's Setup & Keys tab.

## MCP Transport

The server uses **Streamable HTTP** transport (not stdio), accessible at `/mcp`:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/mcp` | Initialize session, send tool calls |
| `GET` | `/mcp` | SSE stream for server-initiated messages |
| `DELETE` | `/mcp` | Close an MCP session |

Sessions use UUID identifiers with 30-minute TTL and automatic cleanup.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ with extensions: `uuid-ossp`, `pgvector`, `pg_trgm`
- At least one API key: Anthropic (recommended) and/or OpenAI

## Quick Start

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
Extended-thinking analysis with configurable depth levels. Uses Anthropic thinking blocks or OpenAI reasoning tokens.

```json
{
  "task": "Review this database query pattern for security issues",
  "context": "const result = await pool.query(`SELECT * FROM users WHERE email = '${email}'`);",
  "tech_stack": ["node", "postgresql"],
  "depth": "deep"
}
```

Depth levels: `standard` (10K thinking tokens), `deep` (20K), `exhaustive` (50K).

## Web Dashboard

The dashboard runs on port 5000 with 6 tabs:

| Tab | Description |
|-----|-------------|
| **Overview** | Status cards, category/severity charts, top patterns |
| **Setup & Keys** | Multi-role provider/model configuration, environment status, MCP endpoint |
| **MCP Tools** | All 8 tool cards with descriptions and parameter schemas |
| **Anti-Patterns** | Filterable/searchable table of all anti-patterns |
| **Judge Sessions** | History of plan critiques with risk scores |
| **Health Check** | 17 system tests across 4 groups (database, search, tools, AI) |

## Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key (default for Provider and Embedding) |

### Optional
| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (default for Judge) | — |
| `AI_PROVIDER` | Provider role: `openai` or `anthropic` | `anthropic` |
| `PROVIDER_MODEL` | Model for Provider role | `claude-sonnet-4-5-20250929` |
| `JUDGE_PROVIDER` | Judge role: `openai` or `anthropic` | `openai` |
| `JUDGE_MODEL` | Model for Judge role | `gpt-5.2` |
| `EMBEDDING_PROVIDER` | Embedding role: `openai` or `anthropic` | `anthropic` |
| `EMBEDDING_MODEL` | Model for Embedding role | `claude-sonnet-4-5-20250929` |

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

- **anti_patterns** — 35+ entries with embeddings, full-text search vectors, severity levels, tech stacks
- **planning_sessions** — Task → plan → critique → outcome lifecycle tracking
- **interview_responses** — Developer interview answers linked to generated anti-patterns
- **tool_invocations** — Audit log of all MCP tool calls

## Commands

| Command | Description |
|---------|-------------|
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
# Run MCP protocol and tools test suite
npm run test-mcp

# Run hypothesis test (flawed plan with 7 known anti-patterns)
npm run test-task
```

## License

MIT
