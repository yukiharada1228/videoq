export const PLAN_CODES = ["free", "basic", "pro"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const PAID_LOOKUP_KEYS = [
  "basic_monthly",
  "basic_yearly",
  "pro_monthly",
  "pro_yearly",
] as const;
export type PaidLookupKey = (typeof PAID_LOOKUP_KEYS)[number];

export type PlanEntitlements = {
  maxVideoUploadSizeMb: number;
  storageLimitGb: number;
  processingLimitMinutes: number;
  aiAnswersLimit: number;
};

export type PlanDefinition = {
  code: PlanCode;
  lookupKeys: { monthly?: PaidLookupKey; yearly?: PaidLookupKey };
  displayAmountYen: { monthly: number; yearly: number };
  entitlements: PlanEntitlements;
};

export const PLAN_CATALOG: Record<PlanCode, PlanDefinition> = {
  free: {
    code: "free",
    lookupKeys: {},
    displayAmountYen: { monthly: 0, yearly: 0 },
    entitlements: {
      maxVideoUploadSizeMb: 200,
      storageLimitGb: 1,
      processingLimitMinutes: 10,
      aiAnswersLimit: 15,
    },
  },
  basic: {
    code: "basic",
    lookupKeys: { monthly: "basic_monthly", yearly: "basic_yearly" },
    displayAmountYen: { monthly: 1480, yearly: 14800 },
    entitlements: {
      maxVideoUploadSizeMb: 1024,
      storageLimitGb: 20,
      processingLimitMinutes: 120,
      aiAnswersLimit: 300,
    },
  },
  pro: {
    code: "pro",
    lookupKeys: { monthly: "pro_monthly", yearly: "pro_yearly" },
    displayAmountYen: { monthly: 3980, yearly: 39800 },
    entitlements: {
      maxVideoUploadSizeMb: 2048,
      storageLimitGb: 100,
      processingLimitMinutes: 600,
      aiAnswersLimit: 1500,
    },
  },
};

const LOOKUP_TO_PLAN: Record<PaidLookupKey, PlanCode> = {
  basic_monthly: "basic",
  basic_yearly: "basic",
  pro_monthly: "pro",
  pro_yearly: "pro",
};

export function isPaidLookupKey(value: string): value is PaidLookupKey {
  return (PAID_LOOKUP_KEYS as readonly string[]).includes(value);
}

export function planCodeFromLookupKey(lookupKey: string): PlanCode | null {
  if (!isPaidLookupKey(lookupKey)) return null;
  return LOOKUP_TO_PLAN[lookupKey];
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function entitlementsForSubscription(
  planCode: PlanCode,
  status: string | null,
): PlanEntitlements {
  if (status && ACTIVE_STATUSES.has(status) && planCode !== "free") {
    return PLAN_CATALOG[planCode].entitlements;
  }
  return PLAN_CATALOG.free.entitlements;
}

export function isPaidPlan(planCode: PlanCode): boolean {
  return planCode === "basic" || planCode === "pro";
}
