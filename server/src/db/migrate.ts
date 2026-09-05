import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';

const directory = dirname(fileURLToPath(import.meta.url));
const pool = createPool(loadConfig().databaseUrl);

try {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const migrationDirectory = resolve(directory, 'migrations');
  const files = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of files) {
    const applied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (applied.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        await readFile(resolve(migrationDirectory, name), 'utf8'),
      );
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        name,
      ]);
      await client.query('COMMIT');
      console.log(`Applied migration ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  console.log('Database migrations complete');
} finally {
  await pool.end();
}
