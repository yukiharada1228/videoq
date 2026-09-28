/** Ordered DDL + isolated data cutover. Run with all chat writers and evaluation workers stopped. */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { convertHistoricalAnswer } from "./migrations/structured-answer/convert";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");
export async function migrateDatabase(client: pg.Client | pg.PoolClient, options: { writersStopped?: boolean } = {}) {
  // Serialize concurrent deployment jobs, including the data conversion between DDL stages.
  await client.query("SELECT pg_advisory_lock(996, 1)");
  let stage: string | undefined;
  try {
    stage = mkdtempSync(join(tmpdir(), "videoq-structured-migration-"));
    const legacyAnswerExists = async () => (await client.query(`SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'chat_logs' AND column_name = 'answer'`)).rowCount;
    if (await legacyAnswerExists() && !options.writersStopped) {
      throw new Error("Stop and drain chat writers and evaluation workers, then set STRUCTURED_ANSWER_WRITERS_STOPPED=1 for the one-time cutover.");
    }
    const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"));
    const entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 24);
    mkdirSync(join(stage, "meta"));
    writeFileSync(join(stage, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const entry of entries) copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(stage, `${entry.tag}.sql`));
    await migrate(drizzle(client), { migrationsFolder: stage });
    if (await legacyAnswerExists()) {
      await client.query("BEGIN");
      try {
        await client.query("LOCK TABLE chat_logs IN ACCESS EXCLUSIVE MODE");
        let after = "0";
        let converted = 0;
        while (true) {
          const { rows } = await client.query(`SELECT id, answer, citations FROM chat_logs
            WHERE id > $1 AND response IS NULL ORDER BY id LIMIT 250`, [after]);
          if (!rows.length) break;
          for (const row of rows) {
            try {
              const answer = convertHistoricalAnswer(row.answer, row.citations);
              await client.query("UPDATE chat_logs SET response = $1::jsonb WHERE id = $2", [JSON.stringify(answer), row.id]);
            } catch {
              // Identify the record for repair without exposing PostgreSQL/JSON data excerpts.
              throw new Error(`Unable to migrate historical chat log ${row.id}`);
            }
          }
          converted += rows.length;
          after = rows.at(-1).id;
        }
        await client.query("COMMIT");
        console.log(`structured-answer migration: converted ${converted} chat logs`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    // NOT NULL is applied before retiring the old fields: incomplete backfills fail closed.
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    try {
      if (stage) rmSync(stage, { recursive: true, force: true });
    } finally {
      await client.query("SELECT pg_advisory_unlock(996, 1)");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:55432/postgres" });
  await client.connect();
  try { await migrateDatabase(client, { writersStopped: process.env.STRUCTURED_ANSWER_WRITERS_STOPPED === "1" }); }
  finally { await client.end(); }
}
