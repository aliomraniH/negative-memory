# Negative Memory MCP Server

## Overview
A PostgreSQL-backed Model Context Protocol (MCP) server that stores and surfaces coding anti-patterns. It uses an adversarial "Judge" system powered by AI with multi-role provider architecture (separate Provider, Judge, and Embedding roles) to critique proposed coding plans against a database of 35 known anti-patterns. Includes a web dashboard for monitoring and setup.

## Architecture
- **Runtime:** Node.js with TypeScript
- **MCP Server:** Streamable HTTP transport at `/mcp` endpoint, integrated into dashboard Express server
- **Dashboard:** Express web server on port 5000, compiled to `dist-dashboard/`; also serves MCP HTTP endpoint
- **Database:** PostgreSQL with pgvector, pg_trgm, uuid-ossp extensions
- **AI Provider:** Multi-role provider system with independently configurable Provider, Judge, and Embedding roles
- **Embeddings:** Hash-based fallback (LLM embedding generation is slow for 1024-dim vectors)

## Project Structure
```
src/
├── index.ts                    # MCP server factory (createMCPServer), tool definitions and handlers
├── db/
│   ├── connection.ts           # PostgreSQL pool management
│   ├── migrations.ts           # Schema setup runner
│   ├── schema.sql              # Full DDL (tables, indexes, functions)
│   ├── seed.sql                # 35 anti-pattern seed entries
│   └── run-seed.ts             # Seed runner with embedding generation
├── services/
│   ├── ai-provider.ts          # Multi-role provider abstraction (Provider/Judge/Embedding roles)
│   ├── claude-reasoning.ts     # Judge system prompt + AI API calls (uses aiCompleteAsJudge)
│   ├── embedding.ts            # Embedding generation (AI + hash fallback)
│   ├── hybrid-search.ts        # RRF hybrid search (vector + full-text)
│   └── stack-parser.ts         # Technology stack detection
├── tools/
│   ├── seed-from-stack.ts      # Tool 1: Detect stack + return matching patterns
│   ├── search-antipatterns.ts  # Tool 2: Hybrid search for anti-patterns
│   ├── add-antipattern.ts      # Tool 3: Add new anti-pattern
│   ├── critique-plan.ts        # Tool 4: THE JUDGE - plan critique
│   ├── get-risk-profile.ts     # Tool 5: Risk summary by tech/module
│   ├── validate-antipattern.ts # Tool 6: Developer validation
│   ├── interview-developer.ts  # Tool 7: Structured failure interview
│   └── deep-analysis.ts        # Tool 8: Extended-thinking analysis (uses judge provider)
└── types/
    └── index.ts                # All TypeScript interfaces and types

dashboard/
├── server.ts                   # Express web server (port 5000)
└── public/
    ├── index.html              # Dashboard SPA
    ├── styles.css              # Dark theme styling
    └── app.js                  # Frontend JavaScript
```

## Multi-Role AI Provider System
- `src/services/ai-provider.ts` — Central abstraction with three independent roles:
  - **Provider** (general AI): `aiComplete()` → uses AI_PROVIDER + PROVIDER_MODEL
  - **Judge** (plan critique, deep analysis): `aiCompleteAsJudge()` → uses JUDGE_PROVIDER + JUDGE_MODEL
  - **Embedding** (anti-pattern search): `aiCompleteForEmbedding()` → uses EMBEDDING_PROVIDER + EMBEDDING_MODEL
- Default configuration: Provider=Anthropic (claude-sonnet-4-5-20250929), Judge=OpenAI (gpt-5.2), Embedding=Anthropic (claude-sonnet-4-5-20250929)
- Each role can be independently switched via dashboard or environment variables
- OpenAI models: gpt-5.2 (default), gpt-5.1, gpt-5, gpt-5-mini, o4-mini, o3, gpt-4.1, gpt-4o
- Anthropic models: claude-sonnet-4-5-20250929 (default), claude-haiku-4-20250414
- OpenAI GPT-5.2 requires `max_completion_tokens` (NOT `max_tokens`)

## Build Configuration
- `tsconfig.json` - MCP server compilation (src/ -> dist/)
- `tsconfig.dashboard.json` - Dashboard compilation (dashboard/ + src/ -> dist-dashboard/)

## Database Tables
- `anti_patterns` - 35 seeded entries across 5 categories (security=10, performance=8, architecture=7, database=6, devops=4)
- `planning_sessions` - Judge critique session records
- `interview_responses` - Developer interview Q&A
- `tool_invocations` - Usage logging

## MCP Tools (8 total)
1. `seed_from_stack` - Detect technologies and return matching anti-patterns
2. `search_antipatterns` - Hybrid search for relevant failure patterns
3. `add_antipattern` - Add new failure patterns to the database
4. `critique_plan` - THE JUDGE: adversarial plan critique (uses Judge role)
5. `get_risk_profile` - Risk summary for tech stacks/modules
6. `validate_antipattern` - Developer confirms/rejects relevance
7. `interview_developer` - Structured failure knowledge extraction
8. `deep_analysis` - Extended-thinking analysis with reasoning tokens (standard/deep/exhaustive depth, uses Judge role)

## Dashboard Tabs
- Overview - Status cards, category/severity charts, top patterns
- Setup & Keys - Multi-role provider/model selection (Provider, Judge, Embedding), environment status, setup checklist, MCP endpoint URL
- MCP Tools - 8 tool cards with descriptions and parameters
- Anti-Patterns - Filterable table of all anti-patterns
- Judge Sessions - Critique history with risk scores
- Health Check - 17 system tests across 4 groups, run individually or all at once

## MCP HTTP Endpoint
- `POST /mcp` - MCP Streamable HTTP transport (initialize, tool calls, notifications)
- `GET /mcp` - SSE stream for server-initiated messages (requires session ID)
- `DELETE /mcp` - Close an MCP session

## Dashboard API Endpoints
- `GET /api/status` - Server status, provider info (all 3 roles), available models
- `POST /api/settings/provider` - Switch provider/model per role (body: {provider, provider_model, judge_provider, judge_model, embedding_provider, embedding_model})
- `GET /api/stats` - Database statistics and charts
- `GET /api/tools` - MCP tool definitions
- `GET /api/mcp-config` - MCP endpoint URL and client configuration JSON
- `GET /api/antipatterns` - Browse anti-patterns with filters
- `GET /api/health/run/:testId` - Run a single health check test
- `GET /api/health/run-all` - Run all 17 tests via SSE streaming

## Required Secrets
- `OPENAI_API_KEY` - OpenAI API key (default for Judge role)
- `ANTHROPIC_API_KEY` - Anthropic API key (default for Provider and Embedding roles)
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)

## Environment Variables for Role Configuration
- `AI_PROVIDER` - Provider role: "openai" or "anthropic" (default: anthropic)
- `PROVIDER_MODEL` - Model for Provider role
- `JUDGE_PROVIDER` - Judge role: "openai" or "anthropic" (default: openai)
- `JUDGE_MODEL` - Model for Judge role (e.g., "gpt-5.2")
- `EMBEDDING_PROVIDER` - Embedding role: "openai" or "anthropic" (default: anthropic)
- `EMBEDDING_MODEL` - Model for Embedding role

## Key Commands
- `npm run build` - Compile both MCP server and dashboard
- `npm run build:mcp` - Compile MCP server only
- `npm run build:dashboard` - Compile dashboard only
- `npm run setup-db` - Run schema migrations
- `npm run seed` - Load 35 anti-pattern seed entries
- `npm run test-mcp` - Run MCP endpoint and tools test suite
- `npm run test-task` - Run hypothesis integration test
- `node dist-dashboard/dashboard/server.js` - Start the dashboard + MCP server (port 5000)

## Workflow
- **Start application** - Runs the dashboard web server on port 5000

## Important Notes
- All MCP server logging uses `console.error` (stdout is reserved for JSON-RPC)
- Embeddings use hash-based fallback when LLM API times out (15s timeout)
- The hybrid search SQL function uses `::double precision` cast for RRF scores
- The `search_tsv` column is auto-populated via a PostgreSQL trigger
- Express 5 is used; wildcard routes use `/{*path}` syntax
- Provider switching via dashboard is runtime-only (persists until server restart); use env vars for permanent config
- Extended thinking: Anthropic uses `thinking: {type:'enabled', budget_tokens}` blocks; OpenAI uses reasoning tokens internally
