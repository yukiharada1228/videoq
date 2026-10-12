import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { requireStripeClient } from "../src/features/billing/stripe";
import type { Bindings } from "../src/types/bindings";

const env = { STRIPE_SECRET_KEY: "sk_test_sdk_compatibility" } as Bindings;

afterEach(() => vi.unstubAllGlobals());

describe("Stripe SDK compatibility", () => {
  it("sends checkout requests with the API version represented by the SDK types", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "cs_test_compatibility",
      object: "checkout.session",
      url: "https://checkout.stripe.com/test",
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);

    const session = await requireStripeClient(env).checkout.sessions.create({
      mode: "subscription",
      customer: "cus_test_compatibility",
      line_items: [{ price: "price_test_compatibility", quantity: 1 }],
      success_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",
    });

    expect(session.url).toBe("https://checkout.stripe.com/test");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(new Headers(init.headers).get("stripe-version")).toBe(Stripe.API_VERSION);
    expect(new URLSearchParams(init.body).get("line_items[0][price]")).toBe("price_test_compatibility");
  });

  it("verifies signed webhook bodies and rejects tampering with the real SDK", async () => {
    const stripe = requireStripeClient(env);
    const secret = "whsec_test_sdk_compatibility";
    const payload = JSON.stringify({
      id: "evt_test_compatibility", object: "event", type: "invoice.paid", data: { object: {} },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

    await expect(stripe.webhooks.constructEventAsync(payload, signature, secret))
      .resolves.toMatchObject({ id: "evt_test_compatibility", type: "invoice.paid" });
    await expect(stripe.webhooks.constructEventAsync(`${payload} `, signature, secret))
      .rejects.toThrow();
  });
});
