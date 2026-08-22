import { z } from "../../shared/openapi";
import { PAID_LOOKUP_KEYS, PLAN_CODES } from "./catalog";

export const billingLocaleSchema = z.enum(["en", "ja"]).optional();

export const checkoutBodySchema = z
  .object({
    lookup_key: z.enum(PAID_LOOKUP_KEYS),
    locale: billingLocaleSchema,
  })
  .openapi("BillingCheckoutRequest");

export const portalBodySchema = z
  .object({
    locale: billingLocaleSchema,
  })
  .openapi("BillingPortalRequest");

export const checkoutResponseSchema = z
  .object({ url: z.string() })
  .openapi("BillingCheckoutResponse");

export const portalResponseSchema = z
  .object({ url: z.string() })
  .openapi("BillingPortalResponse");

const planEntitlementsSchema = z.object({
  max_video_upload_size_mb: z.number().int(),
  storage_limit_gb: z.number(),
  processing_limit_minutes: z.number().int(),
  ai_answers_limit: z.number().int(),
});

export const publicPlanSchema = z
  .object({
    code: z.enum(PLAN_CODES),
    interval: z.enum(["month", "year"]).nullable(),
    lookup_key: z.string().nullable(),
    amount_yen: z.number().int(),
    currency: z.literal("jpy"),
    entitlements: planEntitlementsSchema,
  })
  .openapi("BillingPlan");

export const plansResponseSchema = z
  .object({
    data: z.array(publicPlanSchema),
  })
  .openapi("BillingPlansResponse");
