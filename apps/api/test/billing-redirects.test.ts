import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutSession, createPortalSession } from "../src/features/billing/service";
import { getBillingUser } from "../src/repositories/billing-repository";
import type { Bindings } from "../src/types/bindings";

const { checkoutCreate, portalCreate } = vi.hoisted(() => ({
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
}));

vi.mock("../src/repositories/billing-repository");
vi.mock("stripe", () => ({
  default: class {
    static createFetchHttpClient() { return {}; }
    prices = { list: async () => ({ data: [{ id: "price_basic" }] }) };
    checkout = { sessions: { create: checkoutCreate } };
    billingPortal = { sessions: { create: portalCreate } };
  },
}));

const env = {
  FRONTEND_URL: "https://videoq.example/",
  STRIPE_SECRET_KEY: "sk_test_billing",
} as Bindings;

beforeEach(() => {
  checkoutCreate.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  portalCreate.mockReset().mockResolvedValue({ url: "https://billing.stripe.com/test" });
  vi.mocked(getBillingUser).mockResolvedValue({
    id: "user_1",
    email: "user@example.test",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: null,
    planCode: "free",
    subscriptionStatus: null,
  });
});

describe.each([
  { locale: "ja", prefix: "" },
  { locale: "en", prefix: "/en" },
  { locale: undefined, prefix: "" },
])("billing redirects for locale $locale", ({ locale, prefix }) => {
  it("returns checkout success and cancellation to the same language", async () => {
    await createCheckoutSession(env, "user_1", "basic_monthly", locale);

    expect(checkoutCreate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      success_url: `https://videoq.example${prefix}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://videoq.example${prefix}/pricing?billing=cancel`,
    }));
  });

  it("returns the billing portal to settings in the same language", async () => {
    await createPortalSession(env, "user_1", locale);

    expect(portalCreate).toHaveBeenCalledExactlyOnceWith({
      customer: "cus_1",
      return_url: `https://videoq.example${prefix}/settings`,
    });
  });
});
