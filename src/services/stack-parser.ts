import * as fs from 'fs';
import * as path from 'path';

interface StackParseResult {
  tech_stack: string[];
  frameworks: string[];
  domains: string[];
}

// Keyword dictionaries for detection
const LANGUAGE_KEYWORDS: Record<string, string[]> = {
  python: ['python', 'py', 'pip', 'django', 'flask', 'fastapi', 'pydantic', 'pytest'],
  javascript: ['javascript', 'js', 'node', 'npm', 'yarn', 'react', 'vue', 'angular', 'express'],
  typescript: ['typescript', 'ts', 'tsx', 'tsc'],
  go: ['golang', 'go ', 'gin', 'echo'],
  rust: ['rust', 'cargo', 'tokio', 'actix'],
  java: ['java', 'spring', 'maven', 'gradle', 'jvm'],
  ruby: ['ruby', 'rails', 'gem', 'bundler'],
  php: ['php', 'laravel', 'symfony', 'composer'],
  csharp: ['c#', 'csharp', '.net', 'dotnet', 'aspnet', 'asp.net'],
  sql: ['sql', 'query', 'database'],
};

const DATABASE_KEYWORDS: Record<string, string[]> = {
  postgresql: ['postgresql', 'postgres', 'pg', 'psycopg', 'pgbouncer'],
  mysql: ['mysql', 'mariadb'],
  mongodb: ['mongodb', 'mongo', 'mongoose'],
  redis: ['redis', 'celery'],
  sqlite: ['sqlite'],
  dynamodb: ['dynamodb', 'dynamo'],
  elasticsearch: ['elasticsearch', 'elastic', 'opensearch'],
};

const FRAMEWORK_KEYWORDS: Record<string, string[]> = {
  fastapi: ['fastapi', 'fast api'],
  django: ['django'],
  flask: ['flask'],
  express: ['express', 'expressjs'],
  react: ['react', 'reactjs', 'next.js', 'nextjs'],
  vue: ['vue', 'vuejs', 'nuxt'],
  angular: ['angular'],
  spring: ['spring', 'spring boot', 'springboot'],
  rails: ['rails', 'ruby on rails'],
  sqlalchemy: ['sqlalchemy', 'alembic'],
  sequelize: ['sequelize'],
  typeorm: ['typeorm'],
  prisma: ['prisma'],
  pydantic: ['pydantic'],
  celery: ['celery'],
  docker: ['docker', 'dockerfile', 'container'],
  kubernetes: ['kubernetes', 'k8s', 'helm'],
};

const CLOUD_KEYWORDS: Record<string, string[]> = {
  aws: ['aws', 'amazon', 's3', 'ec2', 'lambda', 'ecs', 'rds', 'sqs', 'sns', 'cloudfront'],
  gcp: ['gcp', 'google cloud', 'bigquery', 'cloud run', 'gke'],
  azure: ['azure', 'cosmos'],
  vercel: ['vercel'],
  heroku: ['heroku'],
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  healthcare: ['healthcare', 'medical', 'patient', 'hipaa', 'phi', 'fhir', 'hl7', 'ehr', 'emr', 'clinical', 'diagnosis', 'billing'],
  fintech: ['fintech', 'financial', 'banking', 'payment', 'trading', 'invoice', 'billing', 'transaction', 'pci', 'stripe'],
  ecommerce: ['ecommerce', 'e-commerce', 'shopping', 'cart', 'checkout', 'product catalog', 'inventory'],
  saas: ['saas', 'multi-tenant', 'subscription', 'tenant'],
  web: ['web', 'website', 'frontend', 'backend', 'api', 'rest', 'graphql'],
  mobile: ['mobile', 'ios', 'android', 'react native', 'flutter'],
  data: ['data pipeline', 'etl', 'data warehouse', 'analytics', 'ml', 'machine learning'],
};

function matchKeywords(text: string, keywords: Record<string, string[]>): string[] {
  const lowerText = text.toLowerCase();
  const matches: string[] = [];

  for (const [key, patterns] of Object.entries(keywords)) {
    for (const pattern of patterns) {
      if (lowerText.includes(pattern)) {
        matches.push(key);
        break;
      }
    }
  }

  return [...new Set(matches)];
}

/**
 * Parse tech stack from a natural language description.
 */
export function parseFromDescription(text: string): StackParseResult {
  const languages = matchKeywords(text, LANGUAGE_KEYWORDS);
  const databases = matchKeywords(text, DATABASE_KEYWORDS);
  const cloud = matchKeywords(text, CLOUD_KEYWORDS);
  const frameworks = matchKeywords(text, FRAMEWORK_KEYWORDS);
  const domains = matchKeywords(text, DOMAIN_KEYWORDS);

  const tech_stack = [...new Set([...languages, ...databases, ...cloud])];

  return {
    tech_stack,
    frameworks,
    domains: domains.length > 0 ? domains : ['any'],
  };
}

/**
 * Parse tech stack from project files.
 */
export function parseFromFiles(projectPath: string): StackParseResult {
  const tech_stack: string[] = [];
  const frameworks: string[] = [];
  const domains: string[] = [];

  // Check package.json
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      tech_stack.push('javascript', 'node');
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      const depMap: Record<string, string> = {
        typescript: 'typescript',
        react: 'react',
        'react-dom': 'react',
        vue: 'vue',
        '@angular/core': 'angular',
        express: 'express',
        fastify: 'fastify',
        'next': 'react',
        nuxt: 'vue',
        prisma: 'prisma',
        '@prisma/client': 'prisma',
        sequelize: 'sequelize',
        typeorm: 'typeorm',
        pg: 'postgresql',
        mysql2: 'mysql',
        mongodb: 'mongodb',
        mongoose: 'mongodb',
        redis: 'redis',
        ioredis: 'redis',
      };

      for (const [dep, mapped] of Object.entries(depMap)) {
        if (dep in allDeps) {
          if (['react', 'vue', 'angular', 'express', 'fastify', 'prisma', 'sequelize', 'typeorm'].includes(mapped)) {
            frameworks.push(mapped);
          } else {
            tech_stack.push(mapped);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check requirements.txt
  const requirementsPath = path.join(projectPath, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    try {
      const content = fs.readFileSync(requirementsPath, 'utf-8').toLowerCase();
      tech_stack.push('python');

      const pyDeps: Record<string, string> = {
        fastapi: 'fastapi',
        django: 'django',
        flask: 'flask',
        sqlalchemy: 'sqlalchemy',
        pydantic: 'pydantic',
        celery: 'celery',
        psycopg2: 'postgresql',
        'psycopg2-binary': 'postgresql',
        pymongo: 'mongodb',
        redis: 'redis',
        boto3: 'aws',
      };

      for (const [dep, mapped] of Object.entries(pyDeps)) {
        if (content.includes(dep)) {
          if (['fastapi', 'django', 'flask', 'sqlalchemy', 'pydantic', 'celery'].includes(mapped)) {
            frameworks.push(mapped);
          } else {
            tech_stack.push(mapped);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // Check Dockerfile
  const dockerfilePath = path.join(projectPath, 'Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    tech_stack.push('docker');
  }

  // Check docker-compose
  for (const compose of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml']) {
    if (fs.existsSync(path.join(projectPath, compose))) {
      tech_stack.push('docker');
      break;
    }
  }

  // Check for Go
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
    tech_stack.push('go');
  }

  // Check for Rust
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
    tech_stack.push('rust');
  }

  return {
    tech_stack: [...new Set(tech_stack)],
    frameworks: [...new Set(frameworks)],
    domains: domains.length > 0 ? domains : ['any'],
  };
}
