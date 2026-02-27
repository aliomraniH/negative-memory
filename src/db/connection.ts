import { Pool, PoolConfig, QueryResult } from 'pg';
import pgvector from 'pgvector/pg';

let pool: Pool | null = null;

function getPoolConfig(): PoolConfig {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'negative_memory',
    user: process.env.PGUSER || 'user',
    password: process.env.PGPASSWORD || 'password',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolConfig());

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

async function registerPgVector(client: import('pg').PoolClient): Promise<void> {
  try {
    await pgvector.registerType(client);
  } catch (err) {
    console.error('[DB] pgvector type registration skipped:', (err as Error).message);
  }
}

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  const p = getPool();
  const client = await p.connect();
  try {
    await registerPgVector(client);
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  const maxRetries = 3;
  const delayMs = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const p = getPool();
      const client = await p.connect();
      try {
        await client.query('SELECT 1');
        console.error(`[DB] Connection successful (attempt ${attempt})`);
        return true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`[DB] Connection attempt ${attempt}/${maxRetries} failed:`, (err as Error).message);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error('[DB] All connection attempts failed');
  return false;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.error('[DB] Pool closed');
  }
}
