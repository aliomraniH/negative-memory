import dotenv from 'dotenv';
dotenv.config();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';

import { query, testConnection, closePool } from './db/connection';
import { seedFromStack } from './tools/seed-from-stack';
import { searchAntiPatterns } from './tools/search-antipatterns';
import { addAntiPattern } from './tools/add-antipattern';
import { critiquePlan } from './tools/critique-plan';
import { getRiskProfile } from './tools/get-risk-profile';
import { validateAntiPattern } from './tools/validate-antipattern';
import { interviewDeveloper } from './tools/interview-developer';

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
  { name: 'negative-memory', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ============================================================================
// Tool Definitions
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'seed_from_stack',
        description:
          'Analyze a project description to detect technologies, then return all matching anti-patterns. Call this FIRST when starting any new project.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            project_description: {
              type: 'string',
              description:
                'Natural language description of the project, its tech stack, and domain.',
            },
            project_path: {
              type: 'string',
              description:
                'Optional file system path to the project root for automatic stack detection from config files.',
            },
          },
          required: ['project_description'],
        },
      },
      {
        name: 'search_antipatterns',
        description:
          'Search the negative example database for anti-patterns relevant to a specific coding task. Call this BEFORE writing any implementation plan.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description:
                'Natural language description of what you are about to implement.',
            },
            tech_stack: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tech stack (e.g., ["python", "postgresql"]).',
            },
            domains: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by domain (e.g., ["healthcare", "fintech"]).',
            },
            severity_filter: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['critical', 'high', 'medium', 'low', 'info'],
              },
              description: 'Filter by severity levels.',
            },
            category_filter: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'security_vulnerability',
                  'performance_issue',
                  'architecture_smell',
                  'database_antipattern',
                  'devops_misconfiguration',
                  'error_handling',
                  'testing_gap',
                  'data_integrity',
                ],
              },
              description: 'Filter by category.',
            },
            max_results: {
              type: 'number',
              description: 'Maximum results to return (default: 10).',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_antipattern',
        description:
          'Add a new anti-pattern to the database. Use when a developer shares a known mistake or the agent discovers a new failure pattern.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            category: {
              type: 'string',
              enum: [
                'security_vulnerability',
                'performance_issue',
                'architecture_smell',
                'database_antipattern',
                'devops_misconfiguration',
                'error_handling',
                'testing_gap',
                'data_integrity',
              ],
            },
            subcategory: { type: 'string' },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low', 'info'],
            },
            title: { type: 'string' },
            description: { type: 'string' },
            root_cause: { type: 'string' },
            bad_code: { type: 'string' },
            good_code: { type: 'string' },
            detection_hint: { type: 'string' },
            prevention_strategy: { type: 'string' },
            tech_stack: { type: 'array', items: { type: 'string' } },
            frameworks: { type: 'array', items: { type: 'string' } },
            domains: { type: 'array', items: { type: 'string' } },
            file_patterns: { type: 'array', items: { type: 'string' } },
            cwe_id: { type: 'number' },
            owasp_category: { type: 'string' },
            source: {
              type: 'string',
              enum: [
                'curated_seed',
                'static_analysis',
                'code_review',
                'developer_interview',
                'web_research',
                'agent_discovered',
              ],
            },
            source_detail: { type: 'string' },
            confidence_score: { type: 'number' },
          },
          required: [
            'category',
            'subcategory',
            'severity',
            'title',
            'description',
            'root_cause',
            'bad_code',
            'good_code',
            'detection_hint',
            'prevention_strategy',
            'tech_stack',
          ],
        },
      },
      {
        name: 'critique_plan',
        description:
          'THE JUDGE: Submit a coding plan for adversarial critique. Returns risks grounded in specific anti-patterns from the database, with a verdict (approve/revise/reject) and concrete fix suggestions.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            task_description: {
              type: 'string',
              description: 'What the task/feature is about.',
            },
            plan: {
              type: 'string',
              description: 'The proposed implementation plan to critique.',
            },
            tech_stack: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tech stack for filtering anti-patterns.',
            },
            task_module: {
              type: 'string',
              description: 'Module or component name this plan affects.',
            },
            code_context: {
              type: 'string',
              description: 'Optional existing code context for more accurate critique.',
            },
          },
          required: ['task_description', 'plan'],
        },
      },
      {
        name: 'get_risk_profile',
        description:
          'Get a risk summary for a module or technology area showing anti-pattern distribution and severity.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            module: {
              type: 'string',
              description: 'Module or component name to focus on.',
            },
            tech_stack: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tech stack.',
            },
            domains: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by domain.',
            },
          },
        },
      },
      {
        name: 'validate_antipattern',
        description:
          'Developer confirms or rejects an anti-pattern\'s relevance. Updates confidence scores.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            antipattern_id: {
              type: 'string',
              description: 'UUID of the anti-pattern to validate.',
            },
            is_relevant: {
              type: 'boolean',
              description:
                'true = developer confirms relevance, false = developer says not relevant.',
            },
            developer_notes: {
              type: 'string',
              description: 'Optional notes from the developer.',
            },
            severity_override: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low', 'info'],
              description: 'Optional severity override.',
            },
          },
          required: ['antipattern_id', 'is_relevant'],
        },
      },
      {
        name: 'interview_developer',
        description:
          'Conduct a structured failure knowledge extraction session. Generates targeted questions, processes responses into anti-pattern entries.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            phase: {
              type: 'string',
              enum: ['generate_questions', 'process_response'],
              description:
                'Phase of the interview: generate_questions creates the session and questions, process_response analyzes a developer answer.',
            },
            tech_stack: {
              type: 'array',
              items: { type: 'string' },
              description: 'Developer\'s tech stack for targeted questions.',
            },
            domains: {
              type: 'array',
              items: { type: 'string' },
              description: 'Relevant domains.',
            },
            session_id: {
              type: 'string',
              description: 'Session ID (required for process_response phase).',
            },
            question_category: {
              type: 'string',
              description: 'Category of the question being answered.',
            },
            question_text: {
              type: 'string',
              description: 'The question that was asked.',
            },
            developer_response: {
              type: 'string',
              description:
                'Developer\'s response to analyze (required for process_response phase).',
            },
          },
          required: ['phase'],
        },
      },
    ],
  };
});

// ============================================================================
// Tool Call Handler
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();
  let errorMessage: string | null = null;

  try {
    let result: unknown;

    switch (name) {
      case 'seed_from_stack':
        result = await seedFromStack(args as any);
        break;
      case 'search_antipatterns':
        result = await searchAntiPatterns(args as any);
        break;
      case 'add_antipattern':
        result = await addAntiPattern(args as any);
        break;
      case 'critique_plan':
        result = await critiquePlan(args as any);
        break;
      case 'get_risk_profile':
        result = await getRiskProfile(args as any);
        break;
      case 'validate_antipattern':
        result = await validateAntiPattern(args as any);
        break;
      case 'interview_developer':
        result = await interviewDeveloper(args as any);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    const duration = Date.now() - startTime;

    // Log invocation (fire and forget)
    logInvocation(name, args, result, duration, null).catch(() => {});

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    errorMessage = (err as Error).message;

    console.error(`[MCP] Tool "${name}" failed:`, errorMessage);

    // Log failed invocation
    logInvocation(name, args, null, duration, errorMessage).catch(() => {});

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Invocation Logger
// ============================================================================

async function logInvocation(
  toolName: string,
  input: unknown,
  output: unknown,
  durationMs: number,
  error: string | null
): Promise<void> {
  try {
    const inputSummary = JSON.stringify(input || {}).substring(0, 500);
    const outputSummary = error
      ? `ERROR: ${error}`
      : JSON.stringify(output || {}).substring(0, 500);

    await query(
      `INSERT INTO tool_invocations (tool_name, input_summary, output_summary, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [toolName, inputSummary, outputSummary, durationMs, error]
    );
  } catch (logErr) {
    console.error('[MCP] Failed to log invocation:', (logErr as Error).message);
  }
}

// ============================================================================
// Server Startup
// ============================================================================

async function main(): Promise<void> {
  console.error('[MCP] Negative Memory MCP Server v1.0.0 starting...');

  // Test database connection
  const dbOk = await testConnection();
  if (dbOk) {
    console.error('[MCP] Database connection verified.');
  } else {
    console.error('[MCP] WARNING: Database connection failed. Tools requiring DB will error.');
  }

  // Connect to MCP via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP] Server connected and ready for requests.');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('[MCP] Received SIGINT, shutting down...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[MCP] Received SIGTERM, shutting down...');
  await closePool();
  process.exit(0);
});

main().catch((err) => {
  console.error('[MCP] Fatal error:', err);
  process.exit(1);
});
