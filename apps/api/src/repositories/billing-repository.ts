import { eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
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
  quotaSource: "plan" | "admin";
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

function asQuotaSource(value: string): "plan" | "admin" {
  return value === "admin" ? "admin" : "plan";
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
        quotaSource: users.quotaSource,
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
      quotaSource: asQuotaSource(row.quotaSource),
    };
  });
}

export async function getBillingUserByStripeCustomerId(
  env: Bindings,
  customerId: string,
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
        quotaSource: users.quotaSource,
      })
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
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
      quotaSource: asQuotaSource(row.quotaSource),
    };
  });
}

export async function applyBillingState(
  env: Bindings,
  userId: string,
  patch: BillingPatch,
  applyEntitlements: boolean,
): Promise<void> {
  return withDb(env, async (db) => {
    const set: {
      updatedAt: ReturnType<typeof sql>;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      planCode?: PlanCode;
      subscriptionStatus?: string | null;
      maxVideoUploadSizeMb?: number;
      storageLimitGb?: number;
      processingLimitMinutes?: number;
      aiAnswersLimit?: number;
    } = {
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    if (patch.stripeCustomerId !== undefined) set.stripeCustomerId = patch.stripeCustomerId;
    if (patch.stripeSubscriptionId !== undefined) {
      set.stripeSubscriptionId = patch.stripeSubscriptionId;
    }
    if (patch.planCode !== undefined) set.planCode = patch.planCode;
    if (patch.subscriptionStatus !== undefined) {
      set.subscriptionStatus = patch.subscriptionStatus;
    }
    if (applyEntitlements && patch.entitlements) {
      set.maxVideoUploadSizeMb = patch.entitlements.maxVideoUploadSizeMb;
      set.storageLimitGb = patch.entitlements.storageLimitGb;
      set.processingLimitMinutes = patch.entitlements.processingLimitMinutes;
      set.aiAnswersLimit = patch.entitlements.aiAnswersLimit;
    }
    await db.update(users).set(set).where(eq(users.id, userId));
  });
}

/** Returns true if this event was newly recorded (not a duplicate). */
export async function claimStripeEvent(
  env: Bindings,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const inserted = await db
      .insert(stripeEvents)
      .values({ id: eventId, type: eventType })
      .onConflictDoNothing({ target: stripeEvents.id })
      .returning({ id: stripeEvents.id });
    return inserted.length > 0;
  });
}
