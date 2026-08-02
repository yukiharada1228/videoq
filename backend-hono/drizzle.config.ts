import { defineConfig } from "drizzle-kit";

/**
 * スキーマ正本（Django migrations から移管）。
 * 既存 Neon には baseline 済み想定 — `drizzle-kit push` で破壊的変更しないこと。
 * 新規 DDL は `drizzle-kit generate` → migrate。
 */
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:55432/postgres",
  },
  strict: true,
  verbose: true,
});
