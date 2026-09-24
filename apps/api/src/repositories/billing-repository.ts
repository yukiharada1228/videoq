import { eq, sql } from "drizzle-orm";
import { withDb, type Db } from "../db/pool";
import { stripeEvents, users } from "../db/schema";
import type { PlanCode, PlanEntitlements } from "../features/billing/catalog";
import type { Bindings } from "../types/bindings";

export type BillingUser = {
  id: string;
  email: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planCode: PlanCode;
  subscriptionStatus: string | null;
};

export type BillingPatch = {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  planCode?: PlanCode;
  subscriptionStatus?: string | null;
  entitlements?: PlanEntitlements;
};

function asPlanCode(value: string): PlanCode {
  if (value === "basic" || value === "pro" || value === "free") return value;
  return "free";
}

export async function getBillingUser(
  env: Bindings,
  userId: string,
): Promise<BillingUser | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        stripeCustomerId: users.stripeCustomerId,
        stripeSubscriptionId: users.stripeSubscriptionId,
        planCode: users.planCode,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      planCode: asPlanCode(row.planCode),
      subscriptionStatus: row.subscriptionStatus,
    };
  });
}

export async function getBillingUserId(
  env: Bindings,
  target: { userId?: string | null; customerId?: string | null },
): Promise<string | null> {
  const where = target.userId
    ? eq(users.id, target.userId)
    : target.customerId ? eq(users.stripeCustomerId, target.customerId) : null;
  if (!where) return null;
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(where)
      .limit(1);
    return rows[0]?.id ?? null;
  });
}

async function updateBillingState(
  db: Pick<Db, "update">,
  userId: string,
  patch: BillingPatch,
): Promise<void> {
  const { entitlements, ...fields } = patch;
  await db.update(users).set({
    ...fields,
    updatedAt: sql`CURRENT_TIMESTAMP`,
    // Evaluate the current quota source while updating, not before Stripe I/O.
    ...(entitlements ? {
      maxVideoUploadSizeMb: sql`CASE WHEN ${users.quotaSource} = 'plan' THEN ${entitlements.maxVideoUploadSizeMb} ELSE ${users.maxVideoUploadSizeMb} END`,
      storageLimitGb: sql`CASE WHEN ${users.quotaSource} = 'plan' THEN ${entitlements.storageLimitGb} ELSE ${users.storageLimitGb} END`,
      processingLimitMinutes: sql`CASE WHEN ${users.quotaSource} = 'plan' THEN ${entitlements.processingLimitMinutes} ELSE ${users.processingLimitMinutes} END`,
      aiAnswersLimit: sql`CASE WHEN ${users.quotaSource} = 'plan' THEN ${entitlements.aiAnswersLimit} ELSE ${users.aiAnswersLimit} END`,
    } : {}),
  }).where(eq(users.id, userId));
}

export async function applyBillingState(
  env: Bindings,
  userId: string,
  patch: BillingPatch,
): Promise<void> {
  return withDb(env, (db) => updateBillingState(db, userId, patch));
}

export async function hasProcessedStripeEvent(
  env: Bindings,
  eventId: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db.select({ id: stripeEvents.id }).from(stripeEvents)
      .where(eq(stripeEvents.id, eventId)).limit(1);
    return rows.length > 0;
  });
}

export type BillingUpdate = { userId: string; patch: BillingPatch };

/** A receipt is committed only together with its effects; concurrent duplicates wait here. */
export async function commitStripeEvent(
  env: Bindings,
  event: { id: string; type: string },
  update: BillingUpdate | null,
): Promise<void> {
  return withDb(env, (db) => db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing({ target: stripeEvents.id })
      .returning({ id: stripeEvents.id });
    if (inserted.length > 0 && update) {
      await updateBillingState(tx, update.userId, update.patch);
    }
  }));
}
