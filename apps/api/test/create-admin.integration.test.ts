import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const run = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/create-admin.mjs", import.meta.url));

(databaseUrl ? describe : describe.skip)("administrator bootstrap CLI", () => {
  const schema = `admin_cli_${crypto.randomUUID().replaceAll("-", "")}`;
  let client: pg.Client;
  let url: URL;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}";
      CREATE TABLE users (id text PRIMARY KEY, username text UNIQUE, email text UNIQUE,
        role text DEFAULT 'user', banned boolean DEFAULT true, ban_expires timestamptz,
        ban_reason text DEFAULT 'test', email_verified boolean DEFAULT false,
        updated_at timestamptz DEFAULT '2020-01-01');`);
    url = new URL(databaseUrl!);
    url.searchParams.set("options", `-csearch_path=${schema}`);
  });
  beforeEach(async () => {
    await client.query(`TRUNCATE users;
      INSERT INTO users (id, username, email) VALUES
        ('first', 'Alice', 'alice@example.test'), ('second', 'alice', 'second@example.test');`);
  });
  afterAll(async () => {
    try { await client?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await client?.end(); }
  });
  const invoke = (...args: string[]) => run(process.execPath, [script, ...args], {
    env: { ...process.env, DATABASE_URL: url.toString() }, timeout: 10_000,
  });
  const snapshot = async () => (await client.query("SELECT * FROM users ORDER BY id")).rows;

  it.each(["case", "email"])("rejects ambiguous identifiers (%s) before changing any account", async (collision) => {
    if (collision === "email") await client.query("UPDATE users SET username = 'alice@example.test' WHERE id = 'second'");
    const before = await snapshot();
    await expect(invoke(collision === "email" ? "alice@example.test" : "ALICE"))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Multiple users match") });
    expect(await snapshot()).toEqual(before);
  });
  it.each([["ALICE@EXAMPLE.TEST"], ["--id", "first"]])("promotes only the selected account (%j)", async (...args) => {
    const before = await snapshot();
    await invoke(...args);
    const after = await snapshot();
    expect(after[0]).toMatchObject({ id: "first", role: "admin", banned: false, ban_reason: null, email_verified: true });
    expect(after[0].updated_at.getTime()).toBeGreaterThan(before[0].updated_at.getTime());
    expect(after[1]).toEqual(before[1]);
  });
  it("promotes by a unique username", async () => {
    await client.query("UPDATE users SET username = 'bob' WHERE id = 'second'");
    await invoke("BOB");
    expect((await snapshot()).map(user => user.role)).toEqual(["user", "admin"]);
  });
  it.each([["missing"], ["--id", "missing"], ["--id"], ["alice", "extra"]])("rejects missing or invalid identifiers (%j)", async (...args) => {
    const before = await snapshot();
    await expect(invoke(...args)).rejects.toMatchObject({ code: 1 });
    expect(await snapshot()).toEqual(before);
  });
});
