/**
 * TypeScript interfaces for Stripe Billing feature
 * Corresponds to backend models defined in backend/app/models/billing.py
 * and API contracts in specs/001-stripe-billing/contracts/billing-api.yaml
 */

/**
 * Subscription status enum
 */
export type SubscriptionStatus = 
  | 'active'       // Subscription is active and paid
  | 'trialing'     // In trial period (future feature)
  | 'past_due'     // Payment failed, in grace period
  | 'cancelled'    // Subscription cancelled, access revoked
  | 'incomplete'   // Payment pending (initial checkout)
  | 'incomplete_expired'; // Payment failed after 23 hours

/**
 * Payment transaction type enum
 */
export type PaymentTransactionType = 
  | 'subscription_payment'  // Monthly subscription charge
  | 'subscription_refund'   // Subscription refund
  | 'overage_charge'        // Usage overage charge (future feature)
  | 'proration'             // Upgrade/downgrade proration adjustment
  | 'dispute';              // Payment dispute/chargeback

/**
 * Payment transaction status enum
 */
export type PaymentTransactionStatus = 
  | 'pending'    // Payment processing
  | 'succeeded'  // Payment successful
  | 'failed'     // Payment failed
  | 'refunded'   // Payment refunded
  | 'disputed';  // Dispute opened

/**
 * Subscription plan interface
 * Represents a pricing tier with associated limits and price
 */
export interface SubscriptionPlan {
  id: number;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  price_display: string;  // Formatted price for display (e.g., "$12.00/month")
  currency: string;
  video_limit: number | null;  // Max videos allowed (null = unlimited)
  transcription_limit_minutes: number | null;  // Max transcription minutes per month (null = unlimited)
  features: string[];  // List of feature descriptions for display
  sort_order: number;
}

/**
 * User subscription interface
 * Links a user to their active subscription plan
 */
export interface UserSubscription {
  id: number;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_start: string;  // ISO 8601 date-time
  current_period_end: string;    // ISO 8601 date-time
  cancel_at_period_end: boolean;
  cancelled_at: string | null;   // ISO 8601 date-time
  created_at: string;             // ISO 8601 date-time
}

/**
 * Usage warning interface
 */
export interface UsageWarning {
  threshold: 80 | 90 | 100;
  resource: 'video' | 'transcription';
  reached: boolean;
}

/**
 * Usage record interface
 * Tracks resource consumption within billing periods for limit enforcement
 */
export interface UsageRecord {
  billing_period_start: string;  // ISO 8601 date-time
  billing_period_end: string;    // ISO 8601 date-time
  video_count: number;
  video_limit: number | null;
  video_usage_percentage: number;
  transcription_seconds: number;
  transcription_minutes: number;
  transcription_limit_minutes: number | null;
  transcription_usage_percentage: number;
  warnings: UsageWarning[];
  updated_at: string;  // ISO 8601 date-time
}

/**
 * Payment transaction interface
 * Records payment events from Stripe
 */
export interface PaymentTransaction {
  id: number;
  amount_cents: number;
  amount_display: string;  // Formatted amount for display (e.g., "$12.00")
  currency: string;
  type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  description: string;
  created_at: string;  // ISO 8601 date-time
}

/**
 * Checkout session response
 * Response from POST /billing/subscription/checkout
 */
export interface CheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
}

/**
 * Checkout session request
 * Request body for POST /billing/subscription/checkout
 */
export interface CheckoutSessionRequest {
  plan_id: number;
  success_url?: string;
  cancel_url?: string;
}

/**
 * Usage check request
 * Request body for POST /billing/usage/check
 */
export interface UsageCheckRequest {
  action: 'upload_video' | 'transcribe_video';
  estimated_duration_seconds?: number;
}

/**
 * Usage check response (allowed)
 * Response from POST /billing/usage/check when action is allowed
 */
export interface UsageCheckAllowedResponse {
  allowed: true;
  reason: null;
  current_usage: UsageRecord;
}

/**
 * Usage check response (not allowed)
 * Response from POST /billing/usage/check when action is not allowed
 */
export interface UsageCheckDeniedResponse {
  allowed: false;
  reason: string;
  upgrade_url: string;
}

/**
 * Union type for usage check response
 */
export type UsageCheckResponse = UsageCheckAllowedResponse | UsageCheckDeniedResponse;

/**
 * Billing history response
 * Response from GET /billing/history
 */
export interface BillingHistoryResponse {
  total: number;
  transactions: PaymentTransaction[];
}

/**
 * Subscription cancellation request
 * Request body for POST /billing/subscription/cancel
 */
export interface SubscriptionCancelRequest {
  immediate?: boolean;  // If true, cancel immediately (admin only)
}
