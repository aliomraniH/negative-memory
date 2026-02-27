import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { getPool, testConnection, closePool, query } from './connection';
import { generateEmbedding } from '../services/embedding';

dotenv.config();

async function runSeed(): Promise<void> {
  console.error('[Seed] Starting seed data loading...');

  const connected = await testConnection();
  if (!connected) {
    console.error('[Seed] Cannot connect to database. Run "npm run setup-db" first.');
    process.exit(1);
  }

  // Check if data already exists
  const countResult = await query('SELECT COUNT(*) as cnt FROM anti_patterns');
  const existingCount = parseInt(countResult.rows[0].cnt, 10);

  if (existingCount > 0) {
    console.error(`[Seed] Database already has ${existingCount} anti-patterns. Skipping seed.`);
    console.error('[Seed] To re-seed, truncate the anti_patterns table first.');
    await closePool();
    return;
  }

  // Read seed SQL
  const seedPath = path.join(__dirname, 'seed.sql');
  let seedSql: string;

  try {
    seedSql = fs.readFileSync(seedPath, 'utf-8');
  } catch {
    const altPath = path.join(__dirname, '..', '..', 'src', 'db', 'seed.sql');
    try {
      seedSql = fs.readFileSync(altPath, 'utf-8');
    } catch (err2) {
      console.error('[Seed] Cannot find seed.sql');
      console.error('[Seed] Error:', (err2 as Error).message);
      process.exit(1);
    }
  }

  // Execute seed SQL
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(seedSql);
    const newCount = await client.query('SELECT COUNT(*) as cnt FROM anti_patterns');
    console.error(`[Seed] Inserted ${newCount.rows[0].cnt} anti-patterns.`);
  } catch (err) {
    console.error('[Seed] Seed SQL execution failed:', (err as Error).message);
    client.release();
    await closePool();
    process.exit(1);
  } finally {
    client.release();
  }

  // Generate embeddings for all seed entries
  console.error('[Seed] Generating embeddings for seed data...');

  const rows = await query(
    'SELECT id, title, description, root_cause, prevention_strategy, subcategory, tech_stack FROM anti_patterns WHERE embedding IS NULL'
  );

  let successCount = 0;
  let failCount = 0;

  for (const row of rows.rows) {
    const textForEmbedding = [
      row.title,
      row.description,
      row.root_cause,
      row.prevention_strategy,
      row.subcategory,
      (row.tech_stack || []).join(', '),
    ].join(' | ');

    try {
      const embedding = await generateEmbedding(textForEmbedding);
      if (embedding) {
        await query(
          'UPDATE anti_patterns SET embedding = $1 WHERE id = $2',
          [`[${embedding.join(',')}]`, row.id]
        );
        successCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      console.error(`[Seed] Embedding failed for "${row.title}":`, (err as Error).message);
      failCount++;
    }
  }

  console.error(`[Seed] Embeddings generated: ${successCount} success, ${failCount} failed.`);
  console.error('[Seed] Seed loading complete.');

  await closePool();
}

runSeed();
