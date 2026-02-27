import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.TEST_URL || 'http://localhost:5000';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration_ms: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    results.push({ name, ...result, duration_ms: Date.now() - start });
    const icon = result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
    console.log(`  ${icon} ${name}: ${result.message} (${Date.now() - start}ms)`);
  } catch (err) {
    results.push({ name, status: 'fail', message: (err as Error).message, duration_ms: Date.now() - start });
    console.log(`  ✗ ${name}: ${(err as Error).message} (${Date.now() - start}ms)`);
  }
}

async function mcpRequest(sessionId: string | null, method: string, params: Record<string, unknown>, id: number): Promise<{ body: string; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  const body = await res.text();
  return { body, headers: res.headers };
}

function parseSSEResponse(body: string): unknown {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.substring(6));
    }
  }
  throw new Error('No SSE data found in response');
}

async function initSession(): Promise<string> {
  const { body, headers } = await mcpRequest(null, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-runner', version: '1.0.0' },
  }, 1);

  const data = parseSSEResponse(body) as any;
  if (!data.result?.serverInfo?.name) throw new Error('Invalid initialize response');

  const sessionId = headers.get('mcp-session-id');
  if (!sessionId) throw new Error('No session ID in response headers');

  return sessionId;
}

async function callTool(sessionId: string, toolName: string, args: Record<string, unknown>, id: number): Promise<any> {
  const { body } = await mcpRequest(sessionId, 'tools/call', { name: toolName, arguments: args }, id);
  const data = parseSSEResponse(body) as any;
  if (data.error) throw new Error(`Tool error: ${JSON.stringify(data.error)}`);
  const text = data.result?.content?.[0]?.text;
  if (!text) throw new Error('No content in tool response');
  return JSON.parse(text);
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  MCP HTTP Endpoint & Tools Test Suite');
  console.log('══════════════════════════════════════════════════════\n');

  console.log('─── Section 1: MCP Protocol Tests ───');

  let sessionId = '';

  await runTest('Initialize session', async () => {
    sessionId = await initSession();
    return { status: 'pass', message: `Session: ${sessionId.substring(0, 8)}...` };
  });

  await runTest('List tools', async () => {
    const { body } = await mcpRequest(sessionId, 'tools/list', {}, 2);
    const data = parseSSEResponse(body) as any;
    const tools = data.result?.tools;
    if (!Array.isArray(tools)) return { status: 'fail', message: 'No tools array' };
    const names = tools.map((t: any) => t.name);
    const expected = ['seed_from_stack', 'search_antipatterns', 'add_antipattern', 'critique_plan', 'get_risk_profile', 'validate_antipattern', 'interview_developer', 'deep_analysis'];
    const missing = expected.filter(e => !names.includes(e));
    if (missing.length > 0) return { status: 'warn', message: `Found ${names.length} tools, missing: ${missing.join(', ')}` };
    return { status: 'pass', message: `All ${expected.length} tools found` };
  });

  await runTest('Invalid session ID rejected', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'mcp-session-id': 'invalid-session-id' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }),
    });
    if (res.status === 404) return { status: 'pass', message: 'Correctly rejected with 404' };
    return { status: 'fail', message: `Expected 404, got ${res.status}` };
  });

  await runTest('Missing session for non-init rejected', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }),
    });
    if (res.status === 400) return { status: 'pass', message: 'Correctly rejected with 400' };
    return { status: 'fail', message: `Expected 400, got ${res.status}` };
  });

  await runTest('Re-initialize on existing session rejected', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 100, method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      }),
    });
    if (res.status === 400) return { status: 'pass', message: 'Correctly rejected re-init' };
    return { status: 'fail', message: `Expected 400, got ${res.status}` };
  });

  await runTest('DELETE session', async () => {
    const tempId = await initSession();
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': tempId },
    });
    if (res.status === 200) return { status: 'pass', message: 'Session deleted' };
    return { status: 'fail', message: `Expected 200, got ${res.status}` };
  });

  console.log('\n─── Section 2: Tool Tests (DB-backed, no AI) ───');

  await runTest('Tool: search_antipatterns', async () => {
    const result = await callTool(sessionId, 'search_antipatterns', { query: 'SQL injection', max_results: 3 }, 10);
    if (!Array.isArray(result) || result.length === 0) return { status: 'fail', message: 'No results returned' };
    return { status: 'pass', message: `Found ${result.length} results: ${result.map((r: any) => r.title).join(', ').substring(0, 80)}` };
  });

  await runTest('Tool: seed_from_stack', async () => {
    const result = await callTool(sessionId, 'seed_from_stack', { project_description: 'Node.js Express REST API with PostgreSQL' }, 11);
    if (!result.matching_antipatterns || !result.detected_stack) return { status: 'fail', message: 'Missing expected fields' };
    return { status: 'pass', message: `Detected: ${result.detected_stack.tech_stack?.join(', ') || 'none'}, matched ${result.matching_antipatterns.length} patterns` };
  });

  await runTest('Tool: get_risk_profile', async () => {
    const result = await callTool(sessionId, 'get_risk_profile', { tech_stack: ['postgresql'] }, 12);
    if (!result.summary) return { status: 'fail', message: 'Missing summary' };
    return { status: 'pass', message: `Total: ${result.summary.total_antipatterns} patterns, ${result.top_risks?.length || 0} top risks` };
  });

  await runTest('Tool: validate_antipattern (read-only check)', async () => {
    const search = await callTool(sessionId, 'search_antipatterns', { query: 'security', max_results: 1 }, 13);
    if (!search[0]?.id) return { status: 'warn', message: 'No patterns to validate' };
    const result = await callTool(sessionId, 'validate_antipattern', { antipattern_id: search[0].id, is_relevant: true, developer_notes: 'Test validation' }, 14);
    if (!result.antipattern_id) return { status: 'fail', message: 'No antipattern_id in result' };
    return { status: 'pass', message: `Validated ${result.title}, confidence: ${result.before.confidence_score} → ${result.after.confidence_score}` };
  });

  console.log('\n─── Section 3: AI-Powered Tool Tests ───');

  const hasAIKey = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

  await runTest('Tool: interview_developer (generate_questions)', async () => {
    if (!hasAIKey) return { status: 'warn', message: 'No AI API key — skipped' };
    const result = await callTool(sessionId, 'interview_developer', {
      phase: 'generate_questions',
      tech_stack: ['python', 'fastapi'],
      domains: ['healthcare'],
    }, 20);
    const qCount = result.questions?.length || 0;
    if (qCount >= 5) return { status: 'pass', message: `Generated ${qCount} questions` };
    return { status: 'warn', message: `Only ${qCount} questions` };
  });

  await runTest('Tool: critique_plan (THE JUDGE)', async () => {
    if (!hasAIKey) return { status: 'warn', message: 'No AI API key — skipped' };
    const result = await callTool(sessionId, 'critique_plan', {
      task_description: 'Build a login endpoint',
      plan: '1. Accept username/password via POST\n2. Query DB: SELECT * FROM users WHERE username=\'' + '${username}\' AND password=\'${password}\'\n3. Return JWT token',
      tech_stack: ['node', 'express', 'postgresql'],
    }, 21);
    if (!result.critique) return { status: 'fail', message: 'No critique returned' };
    const c = result.critique;
    if (c.verdict === 'reject' || c.verdict === 'revise') {
      return { status: 'pass', message: `Verdict: ${c.verdict}, risk: ${c.overall_risk_score}, ${c.risks?.length || 0} risks found` };
    }
    return { status: 'warn', message: `Verdict: ${c.verdict} — expected revise/reject for flawed plan` };
  });

  await runTest('Tool: deep_analysis', async () => {
    if (!hasAIKey) return { status: 'warn', message: 'No AI API key — skipped' };
    const result = await callTool(sessionId, 'deep_analysis', {
      task: 'Analyze whether this Node.js Express API properly handles database connection failures and implements retry logic',
      context: 'const pool = new Pool({ connectionString: process.env.DATABASE_URL });\napp.get("/users", async (req, res) => {\n  const result = await pool.query("SELECT * FROM users");\n  res.json(result.rows);\n});',
      depth: 'standard',
    }, 22);
    if (!result.analysis) return { status: 'fail', message: 'No analysis returned' };
    if (result.analysis.length > 100) return { status: 'pass', message: `Analysis: ${result.analysis.length} chars, thinking: ${result.thinking_summary?.length || 0} chars` };
    return { status: 'warn', message: 'Analysis seems too short' };
  });

  console.log('\n─── Section 4: Session Cleanup ───');

  await runTest('Close test session', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId },
    });
    if (res.status === 200) return { status: 'pass', message: 'Session closed' };
    return { status: 'fail', message: `Expected 200, got ${res.status}` };
  });

  console.log('\n══════════════════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'pass').length;
  const warned = results.filter(r => r.status === 'warn').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const totalTime = results.reduce((s, r) => s + r.duration_ms, 0);
  console.log(`  Results: ${passed} passed, ${warned} warned, ${failed} failed (${totalTime}ms total)`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
