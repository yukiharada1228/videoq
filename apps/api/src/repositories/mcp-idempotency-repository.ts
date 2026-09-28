import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/pool";
import { mcpIdempotencyRecords } from "../db/schema";
import type { Bindings } from "../types/bindings";
import { withDb } from "../db/pool";

const MCP_IDEMPOTENCY_RETENTION_DAYS = 30;

export type CreationIdempotency = {
  action: "request_video_upload" | "create_youtube_video" | "create_course";
  key: string;
  requestHash: string;
};

export type ExistingIdempotentResource =
  | { found: false }
  | { found: true; conflict: true }
  | { found: true; conflict: false; resourceId: number };

/** 呼び出し側が user 行を FOR UPDATE 済みの transaction 内で使う。 */
export async function findIdempotentResource(
  db: Pick<Db, "select">,
  userId: string,
  idempotency: CreationIdempotency | undefined,
): Promise<ExistingIdempotentResource> {
  if (!idempotency) return { found: false };
  const rows = await db
    .select({
      requestHash: mcpIdempotencyRecords.requestHash,
      resourceId: mcpIdempotencyRecords.resourceId,
    })
    .from(mcpIdempotencyRecords)
    .where(
      and(
        eq(mcpIdempotencyRecords.userId, userId),
        eq(mcpIdempotencyRecords.action, idempotency.action),
        eq(mcpIdempotencyRecords.key, idempotency.key),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { found: false };
  if (row.requestHash !== idempotency.requestHash) {
    return { found: true, conflict: true };
  }
  return { found: true, conflict: false, resourceId: Number(row.resourceId) };
}

/** 対象リソースの INSERT と同じ transaction 内で記録する。 */
export async function recordIdempotentResource(
  db: Pick<Db, "insert">,
  userId: string,
  idempotency: CreationIdempotency | undefined,
  resourceId: number,
): Promise<void> {
  if (!idempotency) return;
  await db.insert(mcpIdempotencyRecords).values({
    userId,
    action: idempotency.action,
    key: idempotency.key,
    requestHash: idempotency.requestHash,
    resourceId,
    createdAt: sql`CURRENT_TIMESTAMP`,
  });
}

/** 日次 maintenance で古い再試行台帳を小分けに削除する。 */
export async function pruneMcpIdempotencyRecords(
  env: Bindings,
  retentionDays = MCP_IDEMPOTENCY_RETENTION_DAYS,
  limit = 500,
): Promise<{ deleted: number }> {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1) {
    throw new Error("retentionDays must be a positive integer.");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
    throw new Error("limit must be an integer between 1 and 5000.");
  }
  return withDb(env, async (db) => {
    const victims = db
      .select({
        userId: mcpIdempotencyRecords.userId,
        action: mcpIdempotencyRecords.action,
        key: mcpIdempotencyRecords.key,
      })
      .from(mcpIdempotencyRecords)
      .where(
        lt(
          mcpIdempotencyRecords.createdAt,
          sql`now() - (${retentionDays} * INTERVAL '1 day')`,
        ),
      )
      .orderBy(mcpIdempotencyRecords.createdAt)
      .limit(limit)
      .as("victims");
    const rows = await db
      .delete(mcpIdempotencyRecords)
      .where(
        sql`(${mcpIdempotencyRecords.userId}, ${mcpIdempotencyRecords.action}, ${mcpIdempotencyRecords.key}) IN (SELECT ${victims.userId}, ${victims.action}, ${victims.key} FROM ${victims})`,
      )
      .returning({ key: mcpIdempotencyRecords.key });
    return { deleted: rows.length };
  });
}
