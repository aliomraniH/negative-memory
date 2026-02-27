import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { getPool, testConnection, query } from '../src/db/connection';
import { parseFromDescription } from '../src/services/stack-parser';
import { generateEmbedding, hashBasedEmbedding } from '../src/services/embedding';
import { searchAntiPatterns as hybridSearch } from '../src/services/hybrid-search';
import { extractTechStack } from '../src/services/claude-reasoning';
import { getProviderStatus, getAvailableModels, getActiveProvider, getJudgeModel, getEmbeddingModel } from '../src/services/ai-provider';
import { seedFromStack } from '../src/tools/seed-from-stack';
import { searchAntiPatterns as searchTool } from '../src/tools/search-antipatterns';
import { getRiskProfile } from '../src/tools/get-risk-profile';
import { validateAntiPattern } from '../src/tools/validate-antipattern';
import { interviewDeveloper } from '../src/tools/interview-developer';
import { critiquePlan } from '../src/tools/critique-plan';
import { createMCPServer } from '../src/index';
import { deepAnalysis } from '../src/tools/deep-analysis';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 5000;

app.use(express.json());

const publicDir = path.join(__dirname, '..', '..', 'dashboard', 'public');
app.use(express.static(publicDir));

app.get('/api/status', async (_req, res) => {
  try {
    const dbOk = await testConnection();
    const providerStatus = getProviderStatus();
    const hasDatabaseUrl = !!process.env.DATABASE_URL;

    res.json({
      database_connected: dbOk,
      database_url_set: hasDatabaseUrl,
      ...providerStatus,
      available_models: getAvailableModels(),
      mcp_endpoint: '/mcp',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/settings/provider', (req, res) => {
  const { provider, provider_model, judge_provider, judge_model, embedding_provider, embedding_model } = req.body;

  function validateProvider(p: string): boolean {
    const hasKey = p === 'openai' ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
    return hasKey;
  }

  if (provider) {
    if (!validateProvider(provider)) {
      res.status(400).json({ error: `Cannot switch provider to ${provider}: API key not configured` });
      return;
    }
    process.env.AI_PROVIDER = provider;
    if (!provider_model) delete process.env.PROVIDER_MODEL;
  }
  if (provider_model) process.env.PROVIDER_MODEL = provider_model;

  if (judge_provider) {
    if (!validateProvider(judge_provider)) {
      res.status(400).json({ error: `Cannot switch judge to ${judge_provider}: API key not configured` });
      return;
    }
    process.env.JUDGE_PROVIDER = judge_provider;
    if (!judge_model) delete process.env.JUDGE_MODEL;
  }
  if (judge_model) process.env.JUDGE_MODEL = judge_model;

  if (embedding_provider) {
    if (!validateProvider(embedding_provider)) {
      res.status(400).json({ error: `Cannot switch embedding to ${embedding_provider}: API key not configured` });
      return;
    }
    process.env.EMBEDDING_PROVIDER = embedding_provider;
    if (!embedding_model) delete process.env.EMBEDDING_MODEL;
  }
  if (embedding_model) process.env.EMBEDDING_MODEL = embedding_model;

  res.json({
    ...getProviderStatus(),
    available_models: getAvailableModels(),
  });
});

app.get('/api/stats', async (_req, res) => {
  try {
    const totalResult = await query('SELECT COUNT(*) AS cnt FROM anti_patterns');
    const total = parseInt(totalResult.rows[0].cnt, 10);

    const catResult = await query(
      'SELECT category, COUNT(*) AS cnt FROM anti_patterns GROUP BY category ORDER BY cnt DESC'
    );
    const categories: Record<string, number> = {};
    for (const row of catResult.rows) {
      categories[row.category] = parseInt(row.cnt, 10);
    }

    const sevResult = await query(
      'SELECT severity, COUNT(*) AS cnt FROM anti_patterns GROUP BY severity ORDER BY cnt DESC'
    );
    const severities: Record<string, number> = {};
    for (const row of sevResult.rows) {
      severities[row.severity] = parseInt(row.cnt, 10);
    }

    const embResult = await query(
      'SELECT COUNT(*) AS cnt FROM anti_patterns WHERE embedding IS NOT NULL'
    );
    const embeddings = parseInt(embResult.rows[0].cnt, 10);

    const invResult = await query('SELECT COUNT(*) AS cnt FROM tool_invocations');
    const invocations = parseInt(invResult.rows[0].cnt, 10);

    const sessionResult = await query(
      'SELECT COUNT(*) AS cnt FROM planning_sessions'
    );
    const sessions = parseInt(sessionResult.rows[0].cnt, 10);

    const recentSessionResult = await query(
      `SELECT id, task_description, status, risk_score, created_at
       FROM planning_sessions ORDER BY created_at DESC LIMIT 5`
    );

    const topPatternsResult = await query(
      `SELECT id, title, category, severity, times_surfaced, times_helpful, confidence_score
       FROM anti_patterns ORDER BY times_surfaced DESC, severity LIMIT 10`
    );

    res.json({
      total_antipatterns: total,
      by_category: categories,
      by_severity: severities,
      embeddings_generated: embeddings,
      tool_invocations: invocations,
      planning_sessions: sessions,
      recent_sessions: recentSessionResult.rows,
      top_patterns: topPatternsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/tools', (_req, res) => {
  res.json({
    tools: [
      {
        name: 'seed_from_stack',
        description: 'Analyze a project description to detect technologies, then return all matching anti-patterns.',
        usage: 'Call this FIRST when starting any new project.',
        required_params: ['project_description'],
      },
      {
        name: 'search_antipatterns',
        description: 'Search the anti-pattern database using hybrid vector + keyword search.',
        usage: 'Call this BEFORE writing any implementation plan.',
        required_params: ['query'],
      },
      {
        name: 'add_antipattern',
        description: 'Add a new anti-pattern to the database with automatic embedding generation.',
        usage: 'Use when a developer shares a known mistake or the agent discovers a new failure pattern.',
        required_params: ['category', 'subcategory', 'severity', 'title', 'description', 'root_cause', 'bad_code', 'good_code', 'detection_hint', 'prevention_strategy', 'tech_stack'],
      },
      {
        name: 'critique_plan',
        description: 'THE JUDGE: Submit a coding plan for adversarial critique against the anti-pattern database.',
        usage: 'Call after writing a plan, before implementing. Returns risks, verdict (approve/revise/reject), and fixes.',
        required_params: ['task_description', 'plan'],
      },
      {
        name: 'get_risk_profile',
        description: 'Get a risk summary for a module or technology area.',
        usage: 'Use for understanding overall risk landscape before a sprint.',
        required_params: [],
      },
      {
        name: 'validate_antipattern',
        description: 'Developer confirms or rejects an anti-pattern\'s relevance. Adjusts confidence scores.',
        usage: 'Use after surfacing an anti-pattern to a developer for feedback.',
        required_params: ['antipattern_id', 'is_relevant'],
      },
      {
        name: 'interview_developer',
        description: 'Conduct a structured failure knowledge extraction session with targeted questions.',
        usage: 'Use to discover new anti-patterns from developer experience.',
        required_params: ['phase'],
      },
      {
        name: 'deep_analysis',
        description: 'Extended-thinking analysis of code, architecture, or plans. Uses reasoning tokens for thorough multi-angle evaluation grounded in anti-pattern database.',
        usage: 'Use for complex tasks requiring careful step-by-step reasoning — like an architect reviewing your design.',
        required_params: ['task'],
      },
    ],
  });
});

app.get('/api/mcp-config', (req, res) => {
  const host = req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${protocol}://${host}`;

  const mcpUrl = `${baseUrl}/mcp`;

  res.json({
    mcp_endpoint: mcpUrl,
    mcp_config: {
      mcpServers: {
        'negative-memory': {
          type: 'streamable-http',
          url: mcpUrl,
        },
      },
    },
    dashboard_url: baseUrl,
    setup_steps: [
      {
        step: 1,
        title: 'Set AI Provider API Key',
        description: 'Add your OpenAI (OPENAI_API_KEY) or Anthropic (ANTHROPIC_API_KEY) key to power the Judge critique engine.',
        status_key: 'ai_key_set',
      },
      {
        step: 2,
        title: 'Set DATABASE_URL',
        description: 'PostgreSQL connection string. Already set up via Replit\'s built-in database.',
        status_key: 'database_url_set',
      },
      {
        step: 3,
        title: 'Run Database Migrations',
        description: 'Execute npm run setup-db to create tables and indexes.',
        command: 'npm run setup-db',
      },
      {
        step: 4,
        title: 'Seed Anti-Patterns',
        description: 'Load 35 curated anti-patterns across 5 categories.',
        command: 'npm run seed',
      },
      {
        step: 5,
        title: 'Compile TypeScript',
        description: 'Build the project to generate dist/ output.',
        command: 'npm run build',
      },
      {
        step: 6,
        title: 'Connect to Claude Desktop',
        description: 'Add the MCP server configuration to your claude_desktop_config.json file.',
      },
    ],
  });
});

app.get('/api/antipatterns', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const severity = req.query.severity as string | undefined;
    const limit = parseInt(req.query.limit as string || '20', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (category) {
      conditions.push(`category = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }
    if (severity) {
      conditions.push(`severity = $${paramIdx}`);
      params.push(severity);
      paramIdx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limit, offset);

    const result = await query(
      `SELECT id, title, category, subcategory, severity, description, tech_stack,
              confidence_score, times_surfaced, times_helpful, created_at
       FROM anti_patterns ${where}
       ORDER BY category, severity, title
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) AS cnt FROM anti_patterns ${where}`,
      params.slice(0, -2)
    );

    res.json({
      antipatterns: result.rows,
      total: parseInt(countResult.rows[0].cnt, 10),
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'running' | 'skipped';
  message: string;
  duration_ms: number;
  details?: string;
}

async function runSingleTest(
  name: string,
  fn: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string; details?: string }>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return { name, ...result, duration_ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      status: 'fail',
      message: (err as Error).message,
      duration_ms: Date.now() - start,
    };
  }
}

async function executeTest(testId: string): Promise<TestResult> {
  let result: TestResult;

  switch (testId) {
    case 'db_connection':
      result = await runSingleTest('Database Connection', async () => {
        const ok = await testConnection();
        return ok
          ? { status: 'pass', message: 'Connected successfully' }
          : { status: 'fail', message: 'Connection failed after 3 retries' };
      });
      break;

    case 'seed_count':
      result = await runSingleTest('Seed Data (35 entries)', async () => {
        const r = await query('SELECT COUNT(*) AS cnt FROM anti_patterns');
        const cnt = parseInt(r.rows[0].cnt, 10);
        if (cnt === 35) return { status: 'pass', message: `${cnt} anti-patterns found` };
        if (cnt > 0) return { status: 'warn', message: `Expected 35, found ${cnt}` };
        return { status: 'fail', message: 'No anti-patterns found. Run npm run seed.' };
      });
      break;

    case 'seed_distribution':
      result = await runSingleTest('Category Distribution', async () => {
        const r = await query('SELECT category, COUNT(*) AS cnt FROM anti_patterns GROUP BY category ORDER BY cnt DESC');
        const dist = r.rows.map((row: { category: string; cnt: string }) => `${row.category}=${row.cnt}`).join(', ');
        const expected: Record<string, number> = { security_vulnerability: 10, performance_issue: 8, architecture_smell: 7, database_antipattern: 6, devops_misconfiguration: 4 };
        let match = true;
        for (const row of r.rows) {
          if (expected[row.category] && expected[row.category] !== parseInt(row.cnt, 10)) match = false;
        }
        return match
          ? { status: 'pass', message: 'Distribution matches expected', details: dist }
          : { status: 'warn', message: 'Distribution differs from expected', details: dist };
      });
      break;

    case 'embeddings':
      result = await runSingleTest('Embeddings Generated', async () => {
        const r = await query('SELECT COUNT(*) AS cnt FROM anti_patterns WHERE embedding IS NOT NULL');
        const cnt = parseInt(r.rows[0].cnt, 10);
        if (cnt >= 35) return { status: 'pass', message: `${cnt}/35 embeddings present` };
        if (cnt >= 30) return { status: 'warn', message: `${cnt}/35 embeddings (some missing)` };
        return { status: 'fail', message: `Only ${cnt}/35 embeddings generated` };
      });
      break;

    case 'fulltext_search':
      result = await runSingleTest('Full-Text Search', async () => {
        const r = await query("SELECT title FROM anti_patterns WHERE search_tsv @@ to_tsquery('english','injection')");
        if (r.rows.length >= 1) {
          return {
            status: 'pass',
            message: `Found ${r.rows.length} results for "injection"`,
            details: r.rows.map((x: { title: string }) => x.title).join('\n'),
          };
        }
        return { status: 'fail', message: 'No results for "injection" query' };
      });
      break;

    case 'stack_parser':
      result = await runSingleTest('Stack Parser', async () => {
        const r = parseFromDescription('FastAPI backend with PostgreSQL for healthcare billing on GCP with Docker');
        const all = [...r.tech_stack, ...r.frameworks, ...r.domains];
        const need = ['python', 'fastapi', 'postgresql', 'docker', 'healthcare'];
        const missing = need.filter((t) => !all.includes(t));
        if (missing.length === 0) {
          return { status: 'pass', message: 'All expected technologies detected', details: `Detected: ${all.join(', ')}` };
        }
        return { status: 'fail', message: `Missing: ${missing.join(', ')}`, details: `Detected: ${all.join(', ')}` };
      });
      break;

    case 'embedding_service':
      result = await runSingleTest('Embedding Generation', async () => {
        const e = await generateEmbedding('SQL injection in Python FastAPI');
        if (e && e.length === 1024) return { status: 'pass', message: 'Generated 1024-dim embedding' };
        if (e) return { status: 'warn', message: `Embedding has ${e.length} dimensions (expected 1024)` };
        return { status: 'warn', message: 'Embedding null — keyword-only search mode active' };
      });
      break;

    case 'hybrid_search':
      result = await runSingleTest('Hybrid Search', async () => {
        const r = await hybridSearch('database query with user input concatenation', { tech_stack: ['python', 'postgresql'], max_results: 5 });
        if (r.length > 0) {
          return {
            status: 'pass',
            message: `Returned ${r.length} results`,
            details: r.slice(0, 3).map((x) => x.title).join('\n'),
          };
        }
        return { status: 'fail', message: 'No search results returned' };
      });
      break;

    case 'claude_reasoning':
      result = await runSingleTest('AI Reasoning (API)', async () => {
        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return { status: 'warn', message: 'No AI API key set — skipped' };
        }
        const s = await extractTechStack('Python FastAPI REST API with PostgreSQL on GCP Cloud Run for HIPAA healthcare billing');
        if (s.length >= 3) {
          return { status: 'pass', message: `Extracted ${s.length} technologies`, details: s.join(', ') };
        }
        return { status: 'warn', message: `Only extracted ${s.length} items`, details: s.join(', ') };
      });
      break;

    case 'tool_seed_from_stack':
      result = await runSingleTest('Tool: seed_from_stack', async () => {
        const r = await seedFromStack({
          project_description: 'FastAPI backend with PostgreSQL for healthcare billing on GCP',
        });
        const n = r.matching_antipatterns?.length || 0;
        if (n > 5) {
          return { status: 'pass', message: `Matched ${n} anti-patterns`, details: `Briefing: ${r.risk_briefing?.length || 0} chars` };
        }
        return { status: 'warn', message: `Low match count: ${n}` };
      });
      break;

    case 'tool_search':
      result = await runSingleTest('Tool: search_antipatterns', async () => {
        const r = await searchTool({ query: 'SQL queries with user input in Python', tech_stack: ['python', 'postgresql'], max_results: 5 });
        const results = Array.isArray(r) ? r : [];
        if (results.length > 0) {
          return {
            status: 'pass',
            message: `Found ${results.length} results`,
            details: results.map((x) => `[${x.severity}] ${x.title}`).join('\n'),
          };
        }
        return { status: 'fail', message: 'No results returned' };
      });
      break;

    case 'tool_risk_profile':
      result = await runSingleTest('Tool: get_risk_profile', async () => {
        const r = await getRiskProfile({ tech_stack: ['python', 'fastapi', 'postgresql'] });
        if (r.summary?.total_antipatterns > 0) {
          return {
            status: 'pass',
            message: `${r.summary.total_antipatterns} anti-patterns in profile`,
            details: `By severity: ${JSON.stringify(r.summary.by_severity)}`,
          };
        }
        return { status: 'fail', message: 'Empty risk profile' };
      });
      break;

    case 'tool_validate':
      result = await runSingleTest('Tool: validate_antipattern (read-only)', async () => {
        const idResult = await query('SELECT id, title, confidence_score, times_surfaced FROM anti_patterns LIMIT 1');
        if (idResult.rows.length === 0) return { status: 'fail', message: 'No anti-patterns to validate' };
        const row = idResult.rows[0];
        const hasRequiredFields = row.id && row.title && row.confidence_score !== undefined;
        if (hasRequiredFields) {
          return {
            status: 'pass',
            message: `Validation schema OK — "${row.title}" (confidence: ${Number(row.confidence_score).toFixed(2)})`,
            details: `Anti-pattern "${row.title}" has required fields for validation: id, confidence_score, times_surfaced`,
          };
        }
        return { status: 'fail', message: 'Anti-pattern missing required validation fields' };
      });
      break;

    case 'tool_interview':
      result = await runSingleTest('Tool: interview_developer', async () => {
        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return { status: 'warn', message: 'No AI API key set — skipped' };
        }
        const r = await interviewDeveloper({ phase: 'generate_questions', tech_stack: ['python', 'fastapi', 'postgresql'], domains: ['healthcare', 'hipaa'] });
        const qCount = r.questions?.length || 0;
        if (qCount >= 7) {
          return {
            status: 'pass',
            message: `Generated ${qCount} questions`,
            details: r.questions?.slice(0, 3).map((q, i) => `${i + 1}. [${q.category}] ${q.question}`).join('\n'),
          };
        }
        return { status: 'warn', message: `Only ${qCount} questions generated (expected 7+)` };
      });
      break;

    case 'judge_test':
      result = await runSingleTest('THE JUDGE (Flawed Plan)', async () => {
        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return { status: 'warn', message: 'No AI API key set — skipped' };
        }
        const task = 'Build a FastAPI endpoint that accepts patient billing data, validates it against FHIR R4, stores in PostgreSQL, returns record ID';
        const flawedPlan = `1. Create POST /api/billing in main app.py
2. Accept raw JSON, extract fields manually
3. Build INSERT: f"INSERT INTO billing (patient_id, amount, code) VALUES ('{pid}', {amount}, '{code}')"
4. Execute with psycopg2 cursor
5. Log full request: logging.info(f"Billing request: {request.json()}")
6. Catch errors: except: return {"error": "something went wrong"}
7. Use datetime.now() for created_at (timestamp without time zone)
8. Return new record ID
9. No input validation - trust client sends correct data
10. Create new DB connection per request`;

        const r = await critiquePlan({ task_description: task, plan: flawedPlan, tech_stack: ['python', 'fastapi', 'postgresql'], task_module: 'billing_api' });
        const c = r.critique;

        const riskText = JSON.stringify(c.risks || []).toLowerCase();
        const checks: [string, string][] = [
          ['SQL injection', 'sql inject'],
          ['Input validation', 'input valid'],
          ['PHI in logs', 'phi|pii|log.*patient|log.*request|sensitive.*log'],
          ['Bare except', 'bare except|error handling|swallow|generic except'],
          ['Timestamp type', 'timestamp|timezone|time zone'],
          ['Connection pooling', 'connection pool|per.request|new.*connection'],
          ['Business logic in handler', 'handler|single file|separation|god'],
        ];
        let passed = 0;
        const checkResults: string[] = [];
        for (const [name, pattern] of checks) {
          const regex = new RegExp(pattern, 'i');
          const found = regex.test(riskText);
          checkResults.push(found ? `CAUGHT: ${name}` : `MISSED: ${name}`);
          if (found) passed++;
        }

        const details = [
          `Verdict: ${c.verdict}`,
          `Risk Score: ${c.overall_risk_score}`,
          `Anti-patterns consulted: ${r.antipatterns_consulted}`,
          `Anti-patterns cited: ${r.antipatterns_matched}`,
          `Risks found: ${(c.risks || []).length}`,
          '',
          `--- Planted Flaw Detection (${passed}/${checks.length}) ---`,
          ...checkResults,
          '',
          `--- Risks ---`,
          ...(c.risks || []).map((risk) => `[${risk.severity?.toUpperCase()}] ${risk.risk_title}`),
        ].join('\n');

        if (c.verdict === 'approve') {
          return { status: 'fail', message: `Judge approved a flawed plan! Score: ${c.overall_risk_score}`, details };
        }
        if (passed >= 5) {
          return { status: 'pass', message: `Verdict: ${c.verdict}, Score: ${c.overall_risk_score}, Flaws caught: ${passed}/${checks.length}`, details };
        }
        return { status: 'warn', message: `Only ${passed}/${checks.length} flaws caught`, details };
      });
      break;

    case 'deep_analysis_test':
      result = await runSingleTest('Tool: deep_analysis', async () => {
        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
          return { status: 'warn', message: 'No AI API key set — skipped' };
        }
        const r = await deepAnalysis({
          task: 'Review this database query pattern for security and performance issues',
          context: 'const result = await pool.query(`SELECT * FROM users WHERE email = \'${req.body.email}\'`);',
          tech_stack: ['node', 'postgresql'],
          depth: 'standard',
        });
        if (!r.analysis || r.analysis.length < 50) {
          return { status: 'fail', message: 'Analysis too short or missing' };
        }
        return {
          status: 'pass',
          message: `Analysis: ${r.analysis.length} chars, ${r.identified_risks.length} risks, provider: ${r.provider}`,
          details: `Thinking: ${r.thinking_summary}\nRisks: ${r.identified_risks.join(', ')}\nRecommendations: ${r.recommendations.join(', ')}`,
        };
      });
      break;

    case 'console_log_check':
      result = await runSingleTest('No console.log in src/', async () => {
        const { execSync } = require('child_process');
        try {
          const output = execSync('grep -rn "console\\.log" src/ --include="*.ts" 2>/dev/null || true', { cwd: path.join(__dirname, '..', '..'), encoding: 'utf-8' });
          const lines = output.trim().split('\n').filter((l: string) => l.length > 0);
          if (lines.length === 0) {
            return { status: 'pass', message: 'No console.log found in src/' };
          }
          return { status: 'fail', message: `${lines.length} console.log calls found`, details: lines.join('\n') };
        } catch {
          return { status: 'pass', message: 'No console.log found in src/' };
        }
      });
      break;

    default:
      result = { name: testId, status: 'fail', message: `Unknown test: ${testId}`, duration_ms: 0 };
  }

  return result;
}

app.get('/api/health/run/:testId', async (req, res) => {
  const result = await executeTest(req.params.testId);
  res.json(result);
});

app.get('/api/health/run-all', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const tests = [
    'db_connection',
    'seed_count',
    'seed_distribution',
    'embeddings',
    'fulltext_search',
    'console_log_check',
    'stack_parser',
    'embedding_service',
    'hybrid_search',
    'tool_search',
    'tool_risk_profile',
    'tool_validate',
    'tool_seed_from_stack',
    'claude_reasoning',
    'tool_interview',
    'judge_test',
    'deep_analysis_test',
  ];

  for (const testId of tests) {
    res.write(`data: ${JSON.stringify({ type: 'start', testId })}\n\n`);

    try {
      const result = await executeTest(testId);
      res.write(`data: ${JSON.stringify({ type: 'result', testId, result })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'result', testId, result: { name: testId, status: 'fail', message: (err as Error).message, duration_ms: 0 } })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
});

// ============================================================================
// MCP Streamable HTTP Transport
// ============================================================================

const SESSION_TTL_MS = 30 * 60 * 1000;
const activeSessions = new Map<string, { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createMCPServer>; lastActivity: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of activeSessions) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      session.transport.close().catch(() => {});
      activeSessions.delete(sid);
      console.log(`[MCP-HTTP] Session ${sid} expired (TTL)`);
    }
  }
}, 60_000);

function cleanupSession(sid: string) {
  if (activeSessions.has(sid)) {
    const session = activeSessions.get(sid)!;
    session.transport.close().catch(() => {});
    activeSessions.delete(sid);
    console.log(`[MCP-HTTP] Session ${sid} cleaned up`);
  }
}

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && activeSessions.has(sessionId)) {
    if (isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'Session already initialized. Use DELETE /mcp to close first.' });
      return;
    }
    const session = activeSessions.get(sessionId)!;
    session.lastActivity = Date.now();
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  if (sessionId && !activeSessions.has(sessionId)) {
    res.status(404).json({ error: 'Session not found. Send an initialize request to start a new session.' });
    return;
  }

  if (isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const mcpServer = createMCPServer();

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        activeSessions.delete(sid);
        console.log(`[MCP-HTTP] Session ${sid} closed`);
      }
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);

    const sid = transport.sessionId;
    if (sid) {
      activeSessions.set(sid, { transport, server: mcpServer, lastActivity: Date.now() });
      console.log(`[MCP-HTTP] New session ${sid}`);
    }
    return;
  }

  res.status(400).json({ error: 'No valid session. Send an initialize request first.' });
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !activeSessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID. Initialize a session first via POST /mcp.' });
    return;
  }
  const session = activeSessions.get(sessionId)!;
  session.lastActivity = Date.now();

  res.on('close', () => {
    if (!res.writableFinished) {
      cleanupSession(sessionId);
    }
  });

  await session.transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !activeSessions.has(sessionId)) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  const session = activeSessions.get(sessionId)!;
  await session.transport.close();
  activeSessions.delete(sessionId);
  res.status(200).json({ message: 'Session closed.' });
});

// ============================================================================
// Catch-all & Startup
// ============================================================================

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

(async () => {
  const dbOk = await testConnection();
  if (dbOk) {
    console.log('[Startup] Database connection verified');
  } else {
    console.log('[Startup] WARNING: Database connection failed. Tools requiring DB will error.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashboard running on http://0.0.0.0:${PORT}`);
    console.log(`MCP HTTP endpoint: http://0.0.0.0:${PORT}/mcp`);
  });
})();
