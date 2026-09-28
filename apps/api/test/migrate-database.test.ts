import type pg from "pg";
import { mkdtempSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../scripts/migrate-database";

vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
  mkdtempSync: vi.fn(),
  rmSync: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe("migration lock cleanup", () => {
  it.each(["create", "remove"])("releases the deployment lock when temporary directory %s fails", async (operation) => {
    const failure = new Error("temporary directory unavailable");
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query } as unknown as pg.Client;
    if (operation === "create") {
      vi.mocked(mkdtempSync).mockImplementation(() => { throw failure; });
    } else {
      vi.mocked(mkdtempSync).mockReturnValue("/unused-migration-stage");
      vi.mocked(rmSync).mockImplementation(() => { throw failure; });
    }

    await expect(migrateDatabase(client)).rejects.toBe(failure);
    expect(query).toHaveBeenNthCalledWith(1, "SELECT pg_advisory_lock(996, 1)");
    expect(query).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock(996, 1)");
  });
});
