import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { editCreateConcept, editUpdateConcept } from "../src/features/plog/service";
import { embedQuery } from "../src/lib/embeddings";
import { checkEmbeddingStorage } from "../src/lib/embedding-schema";
import type { Bindings } from "../src/types/bindings";

vi.mock("../src/lib/embeddings", async importOriginal => ({
  ...await importOriginal<typeof import("../src/lib/embeddings")>(),
  embedQuery: vi.fn(),
}));
vi.mock("../src/lib/embedding-schema", async importOriginal => ({
  ...await importOriginal<typeof import("../src/lib/embedding-schema")>(),
  checkEmbeddingStorage: vi.fn(),
}));

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const fixture = readFileSync(new URL("./fixtures/video-deletion.sql", import.meta.url), "utf8");

(databaseUrl ? describe : describe.skip)("PLOG concept edits on PostgreSQL", () => {
  const schema = `plog_concept_edits_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    env = { HYPERDRIVE: { connectionString: url.toString() } } as Bindings;
  });
  beforeEach(async () => {
    vi.mocked(embedQuery).mockReset().mockResolvedValue([3, 4]);
    vi.mocked(checkEmbeddingStorage).mockReset().mockResolvedValue();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(fixture);
    await admin.query("UPDATE plog_concepts SET label = 'Original', embedding = '[1, 0]' WHERE id = 1");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await admin.query("ROLLBACK");
  });
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  async function storedConcept() {
    return (await admin.query("SELECT label, embedding, source_quote FROM plog_concepts WHERE id = 1")).rows[0];
  }

  function observeGraphLock() {
    const reached = Promise.withResolvers<void>();
    const original = pg.Client.prototype.query;
    vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (this: pg.Client, ...args: Parameters<typeof original>) {
      const config = args[0];
      const sql = typeof config === "string" ? config : (config as { text: string }).text;
      if (this !== admin && sql.includes("FROM videos") && sql.includes("FOR UPDATE")) reached.resolve();
      return Reflect.apply(original, this, args);
    } as typeof original);
    return reached.promise;
  }

  it.each([
    { nodeType: "property" }, { introSec: 12 }, { sourceQuote: "Quote" }, {},
  ])("uses one connection and no embedding API for metadata patch %j", async patch => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    await expect(editUpdateConcept(env, 10, 1, patch)).resolves.toMatchObject({ ok: true, value: { label: "Original" } });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(embedQuery).not.toHaveBeenCalled();
    expect(checkEmbeddingStorage).not.toHaveBeenCalled();
    expect((await storedConcept()).embedding).toEqual([1, 0]);
  });

  it("reuses the embedding when the normalized label is unchanged", async () => {
    await expect(editUpdateConcept(env, 10, 1, { label: " Original ", sourceQuote: "New quote" }))
      .resolves.toMatchObject({ ok: true, value: { label: "Original", source_quote: "New quote" } });
    expect(embedQuery).not.toHaveBeenCalled();
    expect(await storedConcept()).toEqual({ label: "Original", embedding: [1, 0], source_quote: "New quote" });
  });

  it("rejects a stale unchanged label instead of pairing it with another edit's embedding, and permits retry", async () => {
    await admin.query("BEGIN");
    await admin.query("SELECT 1 FROM videos WHERE id = 10 FOR UPDATE");
    const reachedLock = observeGraphLock();
    const pending = editUpdateConcept(env, 10, 1, { label: "Original", sourceQuote: "New quote" });
    await reachedLock;
    await admin.query("UPDATE plog_concepts SET label = 'Concurrent', embedding = '[0, 1]' WHERE id = 1");
    await admin.query("COMMIT");
    await expect(pending).resolves.toEqual({
      ok: false, status: 400, message: "Concept label changed. Please retry the edit.",
    });
    expect(await storedConcept()).toEqual({ label: "Concurrent", embedding: [0, 1], source_quote: "" });
    expect(embedQuery).not.toHaveBeenCalled();
    await expect(editUpdateConcept(env, 10, 1, { label: "Original", sourceQuote: "New quote" })).resolves.toMatchObject({ ok: true });
    expect(embedQuery).toHaveBeenCalledExactlyOnceWith(env, "Original");
    expect(await storedConcept()).toEqual({ label: "Original", embedding: [3, 4], source_quote: "New quote" });
  });

  it("returns 404 if the concept disappears after the label read", async () => {
    await admin.query("BEGIN");
    await admin.query("SELECT 1 FROM videos WHERE id = 10 FOR UPDATE");
    const reachedLock = observeGraphLock();
    const pending = editUpdateConcept(env, 10, 1, { label: "Original" });
    await reachedLock;
    await admin.query("DELETE FROM plog_concepts WHERE id = 1");
    await admin.query("COMMIT");
    await expect(pending).resolves.toEqual({ ok: false, status: 404, message: "Concept not found." });
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it.each([2, 99])("returns 404 without embedding for missing or out-of-video concept %i", async conceptId => {
    for (const patch of [{ label: "Renamed" }, { sourceQuote: "New quote" }]) {
      await expect(editUpdateConcept(env, 10, conceptId, patch))
        .resolves.toEqual({ ok: false, status: 404, message: "Concept not found." });
    }
    expect(embedQuery).not.toHaveBeenCalled();
    expect(await storedConcept()).toEqual({ label: "Original", embedding: [1, 0], source_quote: "" });
  });

  it("generates the replacement embedding after closing the label-read connection", async () => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    const end = vi.spyOn(pg.Client.prototype, "end");
    vi.mocked(embedQuery).mockImplementation(async () => {
      expect(connect).toHaveBeenCalledTimes(1);
      expect(end).toHaveBeenCalledTimes(1);
      return [3, 4];
    });
    await expect(editUpdateConcept(env, 10, 1, { label: "Renamed" })).resolves.toMatchObject({ ok: true });
    expect(await storedConcept()).toEqual({ label: "Renamed", embedding: [3, 4], source_quote: "" });
  });

  it.each(["create", "update"])("embeds exactly the label that %s stores at the 255 character limit", async operation => {
    const label = "x".repeat(255) + "truncated suffix";
    const expected = label.slice(0, 255);
    const result = operation === "create"
      ? await editCreateConcept(env, 10, { label, nodeType: "object", introSec: 0, sourceQuote: "" })
      : await editUpdateConcept(env, 10, 1, { label });
    expect(result).toMatchObject({ ok: true, value: { label: expected } });
    expect(embedQuery).toHaveBeenCalledExactlyOnceWith(env, expected);
  });
});
