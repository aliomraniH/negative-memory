import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { getPool, testConnection, closePool } from './connection';

dotenv.config();

async function runMigrations(): Promise<void> {
  console.error('[Migrations] Starting database schema setup...');

  const connected = await testConnection();
  if (!connected) {
    console.error('[Migrations] Cannot connect to database. Check your connection settings.');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  let schemaSql: string;

  try {
    // In dev mode (ts-node), __dirname points to src/db/
    schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  } catch {
    // In compiled mode, __dirname points to dist/db/, but schema.sql is in src/db/
    const altPath = path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql');
    try {
      schemaSql = fs.readFileSync(altPath, 'utf-8');
    } catch (err2) {
      console.error('[Migrations] Cannot find schema.sql at', schemaPath, 'or', altPath);
      console.error('[Migrations] Error:', (err2 as Error).message);
      process.exit(1);
    }
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(schemaSql);
    console.error('[Migrations] Schema setup completed successfully.');

    // Verify tables exist
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('anti_patterns', 'planning_sessions', 'interview_responses', 'tool_invocations')
      ORDER BY table_name
    `);

    console.error('[Migrations] Tables created:');
    for (const row of tables.rows) {
      console.error(`  - ${row.table_name}`);
    }

    // Verify extensions
    const extensions = await client.query(`
      SELECT extname FROM pg_extension
      WHERE extname IN ('uuid-ossp', 'vector', 'pg_trgm')
      ORDER BY extname
    `);

    console.error('[Migrations] Extensions enabled:');
    for (const row of extensions.rows) {
      console.error(`  - ${row.extname}`);
    }
  } catch (err) {
    console.error('[Migrations] Schema setup failed:', (err as Error).message);
    process.exit(1);
  } finally {
    client.release();
    await closePool();
  }
}

runMigrations();
