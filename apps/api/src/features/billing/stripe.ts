import Stripe from "stripe";
import type { Bindings } from "../../types/bindings";
import { apiServiceUnavailable } from "../../shared/errors";

const STRIPE_API_VERSION = "2026-07-29.dahlia" as const;

export function stripeSecretKey(env: Bindings): string | null {
  const key = env.STRIPE_SECRET_KEY?.trim();
  return key ? key : null;
}

export function createStripeClient(apiKey: string): Stripe {
  return new Stripe(apiKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    typescript: true,
  });
}

export function requireStripeClient(env: Bindings): Stripe {
  const key = stripeSecretKey(env);
  if (!key) {
    throw apiServiceUnavailable("Stripe is not configured.", "STRIPE_NOT_CONFIGURED");
  }
  return createStripeClient(key);
}

export function automaticTaxEnabled(env: Bindings): boolean {
  return env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() === "true";
}

export function frontendOrigin(env: Bindings): string {
  return (env.FRONTEND_URL ?? "http://localhost").replace(/\/+$/, "");
}

export function localePrefix(locale: string | undefined): string {
  return locale === "ja" ? "/ja" : "";
}

export function checkoutIntegrationIdentifier(): string {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => (b % 26 + 10).toString(36))
    .join("");
  return `videoq-checkout-${suffix}`;
}
