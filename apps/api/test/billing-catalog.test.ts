import { describe, expect, it } from "vitest";
import {
  entitlementsForSubscription,
  isPaidLookupKey,
  PLAN_CATALOG,
  planCodeFromLookupKey,
} from "../src/features/billing/catalog";
import { FREE_TIER_DEFAULTS } from "../src/shared/signup-quota";

describe("billing catalog", () => {
  it("keeps signup free defaults aligned with Free entitlements", () => {
    expect(FREE_TIER_DEFAULTS).toEqual(PLAN_CATALOG.free.entitlements);
  });

  it("maps lookup keys to paid plans", () => {
    expect(isPaidLookupKey("basic_monthly")).toBe(true);
    expect(planCodeFromLookupKey("basic_yearly")).toBe("basic");
    expect(planCodeFromLookupKey("pro_monthly")).toBe("pro");
    expect(planCodeFromLookupKey("unknown")).toBeNull();
  });

  it("applies paid entitlements only while the subscription is usable", () => {
    expect(entitlementsForSubscription("pro", "active")).toEqual(
      PLAN_CATALOG.pro.entitlements,
    );
    expect(entitlementsForSubscription("pro", "past_due")).toEqual(
      PLAN_CATALOG.pro.entitlements,
    );
    expect(entitlementsForSubscription("pro", "canceled")).toEqual(
      PLAN_CATALOG.free.entitlements,
    );
    expect(entitlementsForSubscription("basic", null)).toEqual(
      PLAN_CATALOG.free.entitlements,
    );
  });
});
