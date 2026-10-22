// This test contains synthetic data only and never reads production credentials.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../operations-tools/package.json', import.meta.url));
const { Client } = require('pg');
const docker = promisify(execFile);
const name = 'videoq-restore-fixture-' + randomBytes(8).toString('hex');
const image = (await fs.readFile(new URL('../operations-tools/Dockerfile', import.meta.url), 'utf8')).trim().replace(/^FROM /, '');
const client = new Client({ connectionString: 'postgresql://postgres:fixture-only@127.0.0.1:54320/postgres' });
try {
  await docker('docker', ['run', '--detach', '--name', name, '-e', 'POSTGRES_PASSWORD=fixture-only',
    '-p', '127.0.0.1:54320:5432', image]);
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await docker('docker', ['exec', name, 'pg_isready', '-U', 'postgres']); break; }
    catch { await delay(1000); }
  }
  await client.connect();
  await client.query(`CREATE EXTENSION vector;
    CREATE TABLE restore_parent(id integer PRIMARY KEY);
    CREATE TABLE restore_child(id integer PRIMARY KEY, parent_id integer REFERENCES restore_parent(id));
    CREATE TABLE restore_vectors(id integer PRIMARY KEY, embedding vector(3));
    INSERT INTO restore_parent VALUES (1); INSERT INTO restore_child VALUES (2,1);
    INSERT INTO restore_vectors VALUES (1, '[1,2,3]');`);
  process.env.DATABASE_URL = 'postgresql://postgres:fixture-only@127.0.0.1:54320/postgres';
  await import('./backup-restore.mjs');
  const report = JSON.parse(await fs.readFile('operations-report.json', 'utf8'));
  assert.equal(report.status, 'ok', JSON.stringify(report));
  console.log('Synthetic vector data, foreign keys and all row counts restored successfully.');
} finally {
  await client.end().catch(() => {});
  await docker('docker', ['rm', '--force', '--volumes', name]);
}
