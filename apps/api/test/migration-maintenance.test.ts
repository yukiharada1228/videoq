import { describe, expect, it, vi } from "vitest";
import { checkStudyRemovalMaintenance } from "../scripts/check-study-removal.mjs";

describe("study removal maintenance check", () => {
  it.each([undefined, "false", "1"])("blocks an existing installation with flag %s", async (flag) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ has_study_tables: true }] }) };
    await expect(checkStudyRemovalMaintenance(client, flag)).rejects.toThrow("requires maintenance");
  });

  it("allows the migration during the maintenance window", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ has_study_tables: true }] }) };
    await expect(checkStudyRemovalMaintenance(client, "true")).resolves.toBeUndefined();
  });

  it("allows fresh installs and already migrated databases without the flag", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ has_study_tables: false }] }) };
    await expect(checkStudyRemovalMaintenance(client, undefined)).resolves.toBeUndefined();
  });

  it("does not continue when the database check fails", async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error("database unavailable")) };
    await expect(checkStudyRemovalMaintenance(client, "true")).rejects.toThrow("database unavailable");
  });
});
