import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../shared/openapi";
import { requireAuth, sessionMethod } from "../../middleware/auth";
import { claimStripeEvent } from "../../repositories/billing-repository";
import { apiBadRequest, apiServiceUnavailable } from "../../shared/errors";
import * as billingService from "./service";
import {
  checkoutBodySchema,
  checkoutResponseSchema,
  plansResponseSchema,
  portalBodySchema,
  portalResponseSchema,
} from "./schemas";
import { requireStripeClient } from "./stripe";

export const billingRoutes = createFeatureRouter();

const sessionOnly = requireAuth(sessionMethod);

const listPlansRoute = createRoute({
  method: "get",
  path: "/plans",
  tags: ["Billing"],
  summary: "List subscription plans",
  responses: {
    200: jsonResponse(plansResponseSchema),
  },
});

billingRoutes.openapi(listPlansRoute, async (c) => {
  const data = await billingService.listPlans(c.env);
  return c.json({ data }, 200);
});

const checkoutRoute = createRoute({
  method: "post",
  path: "/checkout",
  tags: ["Billing"],
  summary: "Create a Stripe Checkout Session",
  middleware: [sessionOnly] as const,
  request: {
    body: {
      content: { "application/json": { schema: checkoutBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(checkoutResponseSchema),
    400: errorResponse("Bad request"),
    401: errorResponse("Unauthorized"),
    409: errorResponse("Subscription already exists"),
    503: errorResponse("Stripe unavailable"),
  },
});

billingRoutes.openapi(checkoutRoute, async (c) => {
  const body = c.req.valid("json");
  const { url } = await billingService.createCheckoutSession(
    c.env,
    c.var.userId!,
    body.lookup_key,
    body.locale,
  );
  return c.json({ url }, 200);
});

const portalRoute = createRoute({
  method: "post",
  path: "/portal",
  tags: ["Billing"],
  summary: "Create a Stripe Customer Portal session",
  middleware: [sessionOnly] as const,
  request: {
    body: {
      content: { "application/json": { schema: portalBodySchema } },
      required: false,
    },
  },
  responses: {
    200: jsonResponse(portalResponseSchema),
    400: errorResponse("Bad request"),
    401: errorResponse("Unauthorized"),
    503: errorResponse("Stripe unavailable"),
  },
});

billingRoutes.openapi(portalRoute, async (c) => {
  const body = c.req.valid("json") ?? {};
  const { url } = await billingService.createPortalSession(
    c.env,
    c.var.userId!,
    body.locale,
  );
  return c.json({ url }, 200);
});

/** Raw body is required for signature verification — do not parse JSON first. */
billingRoutes.post("/webhook", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw apiServiceUnavailable("Webhook secret is not configured.", "STRIPE_WEBHOOK_UNSET");
  }
  const signature = c.req.header("stripe-signature");
  if (!signature) throw apiBadRequest("Missing Stripe-Signature header.", "MISSING_SIGNATURE");

  const rawBody = await c.req.text();
  const stripe = requireStripeClient(c.env);
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch {
    throw apiBadRequest("Invalid Stripe webhook signature.", "INVALID_SIGNATURE");
  }

  const claimed = await claimStripeEvent(c.env, event.id, event.type);
  if (!claimed) return c.json({ received: true }, 200);

  switch (event.type) {
    case "checkout.session.completed":
      await billingService.handleCheckoutCompleted(c.env, event.data.object);
      break;
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await billingService.handleSubscriptionChange(c.env, event.data.object);
      break;
    case "invoice.paid":
      await billingService.handleInvoiceEvent(c.env, event.data.object, false);
      break;
    case "invoice.payment_failed":
      await billingService.handleInvoiceEvent(c.env, event.data.object, true);
      break;
    default:
      break;
  }
  return c.json({ received: true }, 200);
});
