import Stripe from "stripe";
import { findBillingUser } from "../../repositories/billing-repository";
import type { Bindings } from "../../types/bindings";
import { requireStripeClient } from "./stripe";

/** Called by the durable outbox after the account is banned, before data deletion. */
export async function deleteAccountBilling(env: Bindings, userId: string): Promise<void> {
  // Include banned users: deletion must retain their billing identity until this
  // succeeds. Missing rows are possible after a successful SQS delivery is retried.
  const user = await findBillingUser(env, { userId });
  if (!user?.stripeCustomerId) return;
  try {
    // This cancels every subscription and prevents an already-open checkout
    // from starting another one. DELETE is idempotent, including after a timeout.
    await requireStripeClient(env).customers.del(user.stripeCustomerId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.statusCode === 404 && error.code === "resource_missing") return;
    // Credentials, network and provider failures leave the outbox retryable;
    // never discard the only DB link to a customer that might still be billed.
    throw error;
  }
}
