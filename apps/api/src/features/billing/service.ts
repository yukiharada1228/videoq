import type Stripe from "stripe";
import {
  entitlementsForSubscription,
  isPaidLookupKey,
  isPaidPlan,
  PAID_LOOKUP_KEYS,
  PLAN_CATALOG,
  planCodeFromLookupKey,
  type PaidLookupKey,
  type PlanCode,
} from "./catalog";
import {
  applyBillingState,
  getBillingUser,
  getBillingUserByStripeCustomerId,
  type BillingUser,
} from "../../repositories/billing-repository";
import {
  apiBadRequest,
  apiConflict,
  apiNotFound,
  apiServiceUnavailable,
} from "../../shared/errors";
import type { Bindings } from "../../types/bindings";
import {
  automaticTaxEnabled,
  checkoutIntegrationIdentifier,
  frontendOrigin,
  localePrefix,
  requireStripeClient,
  stripeSecretKey,
} from "./stripe";

export type PublicPlan = {
  code: PlanCode;
  interval: "month" | "year" | null;
  lookup_key: string | null;
  amount_yen: number;
  currency: "jpy";
  entitlements: {
    max_video_upload_size_mb: number;
    storage_limit_gb: number;
    processing_limit_minutes: number;
    ai_answers_limit: number;
  };
};

function entitlementsJson(planCode: PlanCode) {
  const e = PLAN_CATALOG[planCode].entitlements;
  return {
    max_video_upload_size_mb: e.maxVideoUploadSizeMb,
    storage_limit_gb: e.storageLimitGb,
    processing_limit_minutes: e.processingLimitMinutes,
    ai_answers_limit: e.aiAnswersLimit,
  };
}

function catalogPlans(): PublicPlan[] {
  const plans: PublicPlan[] = [
    {
      code: "free",
      interval: null,
      lookup_key: null,
      amount_yen: 0,
      currency: "jpy",
      entitlements: entitlementsJson("free"),
    },
  ];
  for (const code of ["basic", "pro"] as const) {
    const def = PLAN_CATALOG[code];
    plans.push(
      {
        code,
        interval: "month",
        lookup_key: def.lookupKeys.monthly ?? null,
        amount_yen: def.displayAmountYen.monthly,
        currency: "jpy",
        entitlements: entitlementsJson(code),
      },
      {
        code,
        interval: "year",
        lookup_key: def.lookupKeys.yearly ?? null,
        amount_yen: def.displayAmountYen.yearly,
        currency: "jpy",
        entitlements: entitlementsJson(code),
      },
    );
  }
  return plans;
}

export async function listPlans(env: Bindings): Promise<PublicPlan[]> {
  const plans = catalogPlans();
  const key = stripeSecretKey(env);
  if (!key) return plans;

  const stripe = requireStripeClient(env);
  const prices = await stripe.prices.list({
    lookup_keys: [...PAID_LOOKUP_KEYS],
    active: true,
  });
  const byLookup = new Map<string, Stripe.Price>();
  for (const price of prices.data) {
    if (price.lookup_key) byLookup.set(price.lookup_key, price);
  }
  return plans.map((plan) => {
    if (!plan.lookup_key) return plan;
    const live = byLookup.get(plan.lookup_key);
    if (!live || live.unit_amount == null) return plan;
    return { ...plan, amount_yen: live.unit_amount, currency: "jpy" };
  });
}

async function priceIdForLookupKey(
  stripe: Stripe,
  lookupKey: PaidLookupKey,
): Promise<string> {
  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    throw apiServiceUnavailable(
      `Stripe price '${lookupKey}' is not configured.`,
      "STRIPE_PRICE_MISSING",
    );
  }
  return price.id;
}

export async function createCheckoutSession(
  env: Bindings,
  userId: string,
  lookupKey: string,
  locale?: string,
): Promise<{ url: string }> {
  if (!isPaidLookupKey(lookupKey)) {
    throw apiBadRequest("Unknown plan lookup key.", "INVALID_LOOKUP_KEY");
  }
  const user = await getBillingUser(env, userId);
  if (!user) throw apiNotFound("User not found");
  if (user.stripeSubscriptionId && user.subscriptionStatus && isPaidPlan(user.planCode)) {
    const active = ["active", "trialing", "past_due"].includes(user.subscriptionStatus);
    if (active) {
      throw apiConflict(
        "You already have an active subscription. Manage it in the customer portal.",
        "SUBSCRIPTION_EXISTS",
      );
    }
  }

  const stripe = requireStripeClient(env);
  const priceId = await priceIdForLookupKey(stripe, lookupKey);
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await applyBillingState(env, user.id, { stripeCustomerId: customerId }, false);
  }

  const origin = frontendOrigin(env);
  const prefix = localePrefix(locale);
  const tax = automaticTaxEnabled(env);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}${prefix}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${prefix}/pricing?billing=cancel`,
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
    ...(tax ? { automatic_tax: { enabled: true } } : {}),
    metadata: { userId: user.id, lookupKey },
    subscription_data: {
      metadata: { userId: user.id, lookupKey },
    },
    integration_identifier: checkoutIntegrationIdentifier(),
  });
  if (!session.url) {
    throw apiServiceUnavailable("Checkout session has no URL.", "STRIPE_CHECKOUT_URL");
  }
  return { url: session.url };
}

export async function createPortalSession(
  env: Bindings,
  userId: string,
  locale?: string,
): Promise<{ url: string }> {
  const user = await getBillingUser(env, userId);
  if (!user) throw apiNotFound("User not found");
  if (!user.stripeCustomerId) {
    throw apiBadRequest("No billing customer on this account.", "NO_STRIPE_CUSTOMER");
  }
  const stripe = requireStripeClient(env);
  const origin = frontendOrigin(env);
  const prefix = localePrefix(locale);
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}${prefix}/settings`,
  });
  return { url: session.url };
}

function customerIdFrom(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

function subscriptionIdFrom(
  value: string | Stripe.Subscription | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function resolveUser(
  env: Bindings,
  opts: { userId?: string | null; customerId?: string | null },
): Promise<BillingUser | null> {
  if (opts.userId) return getBillingUser(env, opts.userId);
  if (opts.customerId) return getBillingUserByStripeCustomerId(env, opts.customerId);
  return null;
}

function planFromSubscription(subscription: Stripe.Subscription): {
  planCode: PlanCode;
  status: string;
} {
  const item = subscription.items.data[0];
  const lookupKey = item?.price?.lookup_key ?? null;
  const fromKey = lookupKey ? planCodeFromLookupKey(lookupKey) : null;
  const planCode = fromKey ?? "free";
  return { planCode, status: subscription.status };
}

export async function syncSubscriptionForUser(
  env: Bindings,
  user: BillingUser,
  subscription: Stripe.Subscription | null,
  customerId: string | null,
): Promise<void> {
  if (!subscription) {
    await applyBillingState(
      env,
      user.id,
      {
        stripeCustomerId: customerId ?? user.stripeCustomerId,
        stripeSubscriptionId: null,
        planCode: "free",
        subscriptionStatus: "canceled",
        entitlements: entitlementsForSubscription("free", "canceled"),
      },
      user.quotaSource === "plan",
    );
    return;
  }

  const { planCode, status } = planFromSubscription(subscription);
  const effectivePlan =
    status === "active" || status === "trialing" || status === "past_due"
      ? planCode
      : "free";
  await applyBillingState(
    env,
    user.id,
    {
      stripeCustomerId: customerId ?? user.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      planCode: effectivePlan,
      subscriptionStatus: status,
      entitlements: entitlementsForSubscription(effectivePlan, status),
    },
    user.quotaSource === "plan",
  );
}

export async function handleCheckoutCompleted(
  env: Bindings,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
  const customerId = customerIdFrom(session.customer);
  const user = await resolveUser(env, { userId, customerId });
  if (!user) return;

  const stripe = requireStripeClient(env);
  const subId = subscriptionIdFrom(session.subscription);
  const subscription = subId
    ? await stripe.subscriptions.retrieve(subId)
    : null;
  await syncSubscriptionForUser(env, user, subscription, customerId);
}

export async function handleSubscriptionChange(
  env: Bindings,
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.userId ?? null;
  const customerId = customerIdFrom(subscription.customer);
  const user = await resolveUser(env, { userId, customerId });
  if (!user) return;
  const ended =
    subscription.status === "canceled" ||
    subscription.status === "unpaid" ||
    subscription.status === "incomplete_expired";
  await syncSubscriptionForUser(
    env,
    user,
    ended ? null : subscription,
    customerId,
  );
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSub = invoice.parent?.subscription_details?.subscription;
  return subscriptionIdFrom(parentSub ?? null);
}

export async function handleInvoiceEvent(
  env: Bindings,
  invoice: Stripe.Invoice,
  failed: boolean,
): Promise<void> {
  const customerId = customerIdFrom(invoice.customer);
  const subId = invoiceSubscriptionId(invoice);
  const user = await resolveUser(env, {
    userId: invoice.metadata?.userId ?? null,
    customerId,
  });
  if (!user) return;
  if (failed) {
    await applyBillingState(
      env,
      user.id,
      {
        subscriptionStatus: "past_due",
        stripeCustomerId: customerId ?? user.stripeCustomerId,
        stripeSubscriptionId: subId ?? user.stripeSubscriptionId,
      },
      false,
    );
    return;
  }
  if (!subId) return;
  const stripe = requireStripeClient(env);
  const subscription = await stripe.subscriptions.retrieve(subId);
  await syncSubscriptionForUser(env, user, subscription, customerId);
}

export async function reapplyPlanEntitlements(
  env: Bindings,
  userId: string,
): Promise<BillingUser | null> {
  const user = await getBillingUser(env, userId);
  if (!user) return null;
  const entitlements = entitlementsForSubscription(user.planCode, user.subscriptionStatus);
  await applyBillingState(
    env,
    userId,
    { entitlements },
    true,
  );
  return getBillingUser(env, userId);
}
