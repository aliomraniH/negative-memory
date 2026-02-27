import dotenv from 'dotenv';
dotenv.config();

import { testConnection, closePool } from '../src/db/connection';
import { searchAntiPatterns } from '../src/tools/search-antipatterns';
import { critiquePlan } from '../src/tools/critique-plan';

// ============================================================================
// Hypothesis Test: Does querying negative examples before coding improve plans?
// ============================================================================

const TEST_TASK = `Build a FastAPI endpoint that accepts patient billing data, validates it against FHIR R4 schema, stores it in PostgreSQL, and returns a confirmation with the record ID.`;

const DELIBERATELY_FLAWED_PLAN = `
## Implementation Plan: Patient Billing Endpoint

### Step 1: Create the route handler
- Add POST /api/billing endpoint to main.py
- Accept raw JSON body using request.json()
- No need for a Pydantic model since FHIR data is complex

### Step 2: Validate against FHIR R4
- Parse the JSON and check required fields manually
- Use if/else to validate field presence

### Step 3: Store in PostgreSQL
- Use this query to store:
  query = f"SELECT * FROM billing WHERE patient_id = '{pid}'"
  cursor.execute(f"INSERT INTO billing_records (patient_id, data, amount, created) VALUES ('{patient_id}', '{json.dumps(data)}', {amount}, timestamp '2024-01-15 10:30:00')")

### Step 4: Log and return
- logging.info(f"Received billing data: {request.body}")
- Log the full request for debugging
- Return the new record ID

### Step 5: Error handling
- Wrap everything in:
  try:
      ... all logic ...
  except:
      pass

### Step 6: Database connection
- Create new connection in each request handler:
  conn = psycopg2.connect(DATABASE_URL)

### Architecture
- All logic will be in the route handler for simplicity
- No need for a service layer for an MVP
`;

async function runTest(): Promise<void> {
  console.log('================================================================');
  console.log('HYPOTHESIS TEST: Negative Example Memory Effectiveness');
  console.log('================================================================');
  console.log('');
  console.log('TASK:', TEST_TASK);
  console.log('');

  // Verify database connection
  const connected = await testConnection();
  if (!connected) {
    console.log('ERROR: Cannot connect to database. Run "npm run setup-db && npm run seed" first.');
    process.exit(1);
  }

  // ---- Phase 1: Search Anti-Patterns ----
  console.log('================================================================');
  console.log('PHASE 1: Searching Negative Example Database');
  console.log('================================================================');
  console.log('');

  const searchStart = Date.now();
  const searchResults = await searchAntiPatterns({
    query: TEST_TASK,
    tech_stack: ['python', 'fastapi', 'postgresql'],
    domains: ['healthcare'],
  });
  const searchDuration = Date.now() - searchStart;

  console.log(`Found ${searchResults.length} matching anti-patterns in ${searchDuration}ms:`);
  console.log('');

  for (const result of searchResults) {
    console.log(`  [${result.severity.toUpperCase()}] ${result.title}`);
    console.log(`    Category: ${result.category}`);
    console.log(`    RRF Score: ${result.rrf_score?.toFixed(4) || 'N/A'}`);
    console.log(`    CWE: ${result.cwe_id || 'N/A'}`);
    console.log('');
  }

  // ---- Phase 2: Critique the Flawed Plan ----
  console.log('================================================================');
  console.log('PHASE 2: THE JUDGE — Adversarial Plan Critique');
  console.log('================================================================');
  console.log('');
  console.log('Submitting deliberately flawed plan...');
  console.log('');

  const critiqueStart = Date.now();
  const critiqueResult = await critiquePlan({
    task_description: TEST_TASK,
    plan: DELIBERATELY_FLAWED_PLAN,
    tech_stack: ['python', 'fastapi', 'postgresql'],
    task_module: 'billing',
  });
  const critiqueDuration = Date.now() - critiqueStart;

  const { critique } = critiqueResult;

  console.log(`Verdict: ${critique.verdict.toUpperCase()}`);
  console.log(`Overall Risk Score: ${critique.overall_risk_score.toFixed(2)}/1.00`);
  console.log(`Anti-patterns consulted: ${critiqueResult.antipatterns_consulted}`);
  console.log(`Anti-patterns matched in risks: ${critiqueResult.antipatterns_matched}`);
  console.log(`Critique duration: ${critiqueDuration}ms`);
  console.log('');

  // Print each risk
  if (critique.risks.length > 0) {
    console.log('--- RISKS IDENTIFIED ---');
    console.log('');

    for (let i = 0; i < critique.risks.length; i++) {
      const risk = critique.risks[i];
      console.log(`  Risk ${i + 1}: ${risk.risk_title}`);
      console.log(`    Severity: ${risk.severity}`);
      console.log(`    Matched Anti-Pattern: ${risk.matched_antipattern_title}`);
      console.log(`    Plan Excerpt: "${risk.plan_excerpt?.substring(0, 100)}..."`);
      console.log(`    Explanation: ${risk.explanation}`);
      console.log(`    Fix: ${risk.suggested_fix}`);
      console.log('');
    }
  }

  // Print safe aspects
  if (critique.safe_aspects.length > 0) {
    console.log('--- SAFE ASPECTS ---');
    for (const aspect of critique.safe_aspects) {
      console.log(`  + ${aspect}`);
    }
    console.log('');
  }

  // Print suggestions
  if (critique.refined_plan_suggestions.length > 0) {
    console.log('--- REFINEMENT SUGGESTIONS ---');
    for (const suggestion of critique.refined_plan_suggestions) {
      console.log(`  > ${suggestion}`);
    }
    console.log('');
  }

  // ---- Phase 3: Metrics ----
  console.log('================================================================');
  console.log('METRICS');
  console.log('================================================================');
  console.log('');

  // Known planted anti-patterns in the flawed plan
  const plantedPatterns = [
    'SQL Injection (f-string in query)',
    'Missing Input Validation (no Pydantic model)',
    'PHI in Logs (logging request.body)',
    'Bare Except (except: pass)',
    'Timestamp Without Timezone',
    'No Connection Pooling (psycopg2.connect per request)',
    'Business Logic in Handler (all logic in route)',
  ];

  console.log('Planted anti-patterns in flawed plan:');
  for (const p of plantedPatterns) {
    console.log(`  - ${p}`);
  }
  console.log('');

  const matchedTitles = critique.risks.map((r) => r.matched_antipattern_title.toLowerCase());
  let caught = 0;
  for (const planted of plantedPatterns) {
    const keywords = planted.toLowerCase().split(/[()]/)[0].trim().split(' ');
    const isCaught = matchedTitles.some((title) =>
      keywords.some((kw) => kw.length > 3 && title.includes(kw))
    );
    if (isCaught) caught++;
  }

  console.log(`Detection rate: ${caught}/${plantedPatterns.length} planted patterns caught (${((caught / plantedPatterns.length) * 100).toFixed(0)}%)`);
  console.log(`Total risks found: ${critique.risks.length}`);
  console.log(`Search time: ${searchDuration}ms`);
  console.log(`Critique time: ${critiqueDuration}ms`);
  console.log(`Total time: ${searchDuration + critiqueDuration}ms`);
  console.log('');

  console.log('================================================================');
  console.log('TEST COMPLETE');
  console.log('================================================================');

  await closePool();
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
