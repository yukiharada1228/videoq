# Research: Stripe Billing with Usage-Based Limits

**Feature**: 001-stripe-billing
**Date**: 2026-02-01
**Status**: Completed

## Overview

This document consolidates research findings for implementing Stripe-based billing with usage limits. All technical decisions and best practices are documented here to resolve unknowns identified in the Technical Context section.

## Research Questions

### 1. Stripe SDK Version and Integration Approach

**Decision**: Use `stripe>=10.15.0` (latest stable as of 2026-01)

**Rationale**:
- Latest version includes improved webhook signature verification (v10+)
- Supports Stripe Checkout Sessions for hosted payment pages (reduces PCI scope)
- Python SDK has built-in retry logic and idempotency for API calls
- Type hints included for better IDE support and type safety

**Integration Pattern**: Stripe Checkout (hosted pages) for initial implementation
- **Pro**: Reduces frontend complexity, Stripe handles card collection and PCI compliance
- **Pro**: Built-in fraud detection (Radar) with no additional setup
- **Pro**: Mobile-responsive out of the box
- **Con**: Less UI customization than Stripe Elements (acceptable for MVP)

**Alternatives Considered**:
- Stripe Elements (embedded forms): Rejected due to increased frontend complexity and PCI scope
- PayPal/Square: Rejected as not industry standard for SaaS subscriptions
- Custom payment processing: Rejected due to PCI compliance requirements

**Reference**: https://stripe.com/docs/api/checkout/sessions (Stripe Checkout documentation)

### 2. Subscription Tier Pricing Strategy

**Decision**: Three-tier pricing model with fixed monthly prices and usage limits

**Pricing Structure**:
```
Free Tier:
  - Price: $0/month
  - Video Limit: 3 videos
  - Transcription Limit: 30 minutes/month
  - Target: Trial users, hobbyists

Standard Tier:
  - Price: $12/month (suggested starting point)
  - Video Limit: 50 videos
  - Transcription Limit: 300 minutes/month (5 hours)
  - Whisper API cost: ~$1.80/month if fully utilized ($0.006/min × 300)
  - Target: Individual professionals, researchers

Premium Tier:
  - Price: $49/month (suggested starting point)
  - Video Limit: null (unlimited)
  - Transcription Limit: 1000 minutes/month (16.67 hours)
  - Whisper API cost: ~$6/month if fully utilized
  - Target: Power users, small teams
```

**Rationale**:
- 4:1 pricing gap between Free→Standard encourages conversion without seeming predatory
- Standard tier margin: $12 - $1.80 = $10.20 covers hosting, storage, development
- Premium tier margin: $49 - $6 = $43 provides healthy margin for enterprise features
- Transcription limits based on Whisper API costs ($0.006/min = $0.0001/sec)
- Video limits prevent storage abuse while allowing meaningful usage

**Pricing Psychology**:
- Free tier: Generous enough for evaluation (30 min = 6 × 5-min videos typical use)
- Standard tier: Targets $10-15/month "pain-free" price point for individuals
- Premium tier: Anchors value perception, makes Standard seem affordable

**Alternatives Considered**:
- Pure usage-based (pay per minute): Rejected due to unpredictable billing (user friction)
- Annual-only billing: Rejected for MVP simplicity, can add later
- Four+ tiers: Rejected to avoid decision paralysis (3 tiers = Goldilocks effect)

**Reference**: https://stripe.com/resources/more/tiered-pricing-101-a-guide-for-a-strategic-approach

### 3. Webhook Event Handling Strategy

**Decision**: Implement Celery task queue for async webhook processing with idempotency

**Critical Webhook Events**:
```python
CRITICAL_EVENTS = [
    'checkout.session.completed',      # New subscription created
    'customer.subscription.updated',   # Plan change, renewal
    'customer.subscription.deleted',   # Cancellation
    'invoice.payment_succeeded',       # Successful payment
    'invoice.payment_failed',          # Failed payment (dunning)
]
```

**Processing Pattern**:
1. Webhook view validates Stripe signature (using `stripe.Webhook.construct_event`)
2. Event ID stored in cache (Redis) for idempotency (TTL: 7 days)
3. Event dispatched to Celery task for async processing
4. Task updates subscription status, adjusts limits, sends user notifications
5. Retry logic: 3 attempts with exponential backoff (1min, 5min, 15min)

**Idempotency Strategy**:
- Check `event.id` in Redis before processing
- Stripe may send duplicate webhooks (network retries)
- Critical for payment events to prevent double-charging or double-crediting

**Error Handling**:
- Webhook failures logged to admin panel for manual review
- User notified if payment fails (dunning email sequence)
- Grace period: 3 days before downgrading on payment failure

**Alternatives Considered**:
- Synchronous webhook processing: Rejected due to 5-second timeout risk (Stripe retries if no 200 OK)
- Polling Stripe API: Rejected due to rate limits and delayed updates (webhooks are real-time)
- Manual subscription management: Not scalable

**Reference**: https://stripe.com/docs/webhooks/best-practices

### 4. Usage Tracking and Limit Enforcement Architecture

**Decision**: Dual-layer tracking with Redis cache + PostgreSQL persistence

**Architecture**:
```
Layer 1: Redis (Hot Path - Real-time checks)
  Key: f"usage:{user_id}:{billing_period}"
  Value: {"video_count": 12, "transcription_seconds": 1234, "updated_at": "2026-02-01T10:30:00Z"}
  TTL: End of billing period + 7 days
  Use: Pre-upload limit checks (<10ms latency)

Layer 2: PostgreSQL (Cold Storage - Billing and audit)
  Table: UsageRecord
  Fields: user_id, billing_period_start, billing_period_end, video_count, transcription_seconds
  Use: Monthly billing calculations, historical analytics, dispute resolution
```

**Enforcement Flow**:
```python
# Pre-upload check (video upload)
def can_upload_video(user_id: int) -> tuple[bool, str]:
    """Check if user can upload based on current limits."""
    usage = get_usage_from_redis(user_id)  # Fast cache lookup
    plan = get_user_plan(user_id)  # Cached subscription info

    if plan.video_limit is None:
        return True, ""  # Unlimited

    if usage["video_count"] >= plan.video_limit:
        return False, f"Video limit reached ({plan.video_limit}). Upgrade to upload more."

    return True, ""

# Post-transcription tracking
def record_transcription(user_id: int, duration_seconds: int):
    """Update usage counters after transcription completes."""
    # Update Redis (atomic increment)
    redis.hincrby(f"usage:{user_id}:{current_period()}", "transcription_seconds", duration_seconds)

    # Update PostgreSQL (debounced via Celery task every 5 minutes)
    update_usage_record_task.apply_async(args=[user_id, duration_seconds])

    # Check for notification thresholds
    if usage_percentage >= 80:
        send_usage_warning_email(user_id, usage_percentage)
```

**Sync Strategy**:
- Redis → PostgreSQL sync every 5 minutes (batched writes)
- On billing period end: Force sync, create historical UsageRecord snapshot
- On subscription change: Immediate sync to ensure accurate proration

**Edge Cases**:
- Redis cache miss: Fall back to PostgreSQL (slower but accurate)
- Concurrent uploads: Redis HINCRBY is atomic, prevents race conditions
- Mid-transcription limit hit: Grace period allows completion, blocks new uploads

**Alternatives Considered**:
- PostgreSQL-only: Rejected due to latency concerns (N+1 queries on every upload)
- Redis-only: Rejected due to data loss risk (no persistence guarantee)
- Eventual consistency: Rejected due to billing accuracy requirements

**Reference**: https://stripe.com/resources/more/usage-based-pricing-for-saas-how-to-make-the-most-of-this-pricing-model

### 5. Billing Cycle Management and Proration

**Decision**: Monthly billing cycles with Stripe automatic proration on upgrades

**Billing Period Calculation**:
```python
# User subscribes on 2026-02-15
subscription.current_period_start = "2026-02-15T14:30:00Z"
subscription.current_period_end = "2026-03-15T14:30:00Z"  # Exactly 1 month later

# Usage resets at period end, new period begins
next_period_start = "2026-03-15T14:30:00Z"
next_period_end = "2026-04-15T14:30:00Z"
```

**Upgrade Proration** (Stripe handles automatically):
- User on Standard ($12/month) upgrades to Premium ($49/month) on day 15 of 30-day cycle
- Stripe calculates: Unused Standard credit = $12 × (15/30) = $6
- Immediate charge: ($49 - $6) = $43 for remaining 15 days + full next month
- Next renewal: Full $49/month

**Downgrade Behavior** (custom logic):
- Downgrade takes effect at next billing period (not immediate)
- User retains current plan benefits until period end
- Warning shown: "Your plan will change to Standard on March 15, 2026"
- If current usage exceeds new limits: Display warning about content becoming inaccessible

**Usage Reset Logic**:
```python
# Celery periodic task (runs hourly)
@celery.task
def reset_expired_billing_periods():
    """Reset usage counters for subscriptions entering new billing period."""
    now = timezone.now()

    # Find subscriptions where current_period_end <= now
    expiring_subs = UserSubscription.objects.filter(
        current_period_end__lte=now,
        status='active'
    )

    for sub in expiring_subs:
        # Archive current period usage
        archive_usage_record(sub.user_id, sub.current_period_start, sub.current_period_end)

        # Reset Redis counter
        redis.delete(f"usage:{sub.user_id}:{sub.current_period_start}")

        # Update subscription period
        sub.current_period_start = sub.current_period_end
        sub.current_period_end = sub.current_period_end + timedelta(days=30)  # Simplified
        sub.save()
```

**Alternatives Considered**:
- Calendar month boundaries (1st-end of month): Rejected due to proration complexity and unfair treatment of mid-month signups
- Immediate downgrades: Rejected due to potential data loss and user frustration
- Annual billing only: Deferred for MVP simplicity

**Reference**: https://stripe.com/docs/billing/subscriptions/prorations

### 6. Frontend State Management for Billing

**Decision**: React hooks with SWR-like pattern (custom implementation)

**Hooks Architecture**:
```typescript
// Custom hook for subscription data
export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    fetchSubscription()
      .then(setSubscription)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  const upgrade = async (planId: string) => {
    const session = await createCheckoutSession(planId)
    window.location.href = session.url  // Redirect to Stripe Checkout
  }

  return { subscription, loading, error, upgrade }
}

// Custom hook for usage tracking
export function useUsage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [refreshInterval, setRefreshInterval] = useState(60000)  // 1 minute

  // Auto-refresh every minute
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsage().then(setUsage)
    }, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval])

  return { usage, refresh: () => fetchUsage().then(setUsage) }
}
```

**State Synchronization**:
- Subscription data cached for session (fetch once on app load)
- Usage data refreshed every 60 seconds when on billing page
- Optimistic updates on user actions (upgrade button shows loading state immediately)

**Alternatives Considered**:
- Redux/Zustand: Rejected as overkill for billing-only state
- React Query/SWR: Rejected to avoid new dependency (constitution complexity justification required)
- Context API: Rejected due to unnecessary re-renders across unrelated components

**Reference**: VideoQ Constitution I.IV (Complexity Justification) - avoiding new dependencies unless justified

### 7. Internationalization (i18next) for Billing UI

**Decision**: Separate billing.json namespace with currency formatting utilities

**Translation Structure**:
```json
// en/billing.json
{
  "plans": {
    "free": {
      "name": "Free",
      "description": "Perfect for trying out VideoQ",
      "price": "$0",
      "features": {
        "videos": "{{count}} videos",
        "transcription": "{{minutes}} minutes transcription/month"
      }
    },
    "standard": {
      "name": "Standard",
      "description": "For individual professionals",
      "price": "$12/month",
      "features": {
        "videos": "{{count}} videos",
        "transcription": "{{minutes}} minutes transcription/month"
      }
    }
  },
  "usage": {
    "title": "Your Usage",
    "videos": "{{used}} of {{limit}} videos used",
    "transcription": "{{used}} of {{limit}} minutes used",
    "warning_80": "You've used 80% of your {{resource}} limit",
    "warning_100": "You've reached your {{resource}} limit. Upgrade to continue."
  },
  "errors": {
    "payment_failed": "Payment failed. Please update your payment method.",
    "limit_exceeded": "Upload limit reached. Please upgrade your plan or wait for next billing cycle.",
    "webhook_error": "Billing update failed. Please contact support."
  }
}
```

**Currency Formatting**:
```typescript
// Locale-aware currency formatting
const formatPrice = (amount: number, currency: string, locale: string) => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(amount / 100)  // Stripe amounts in cents
}

// Usage: formatPrice(1200, 'USD', 'en-US') → "$12.00"
//        formatPrice(1200, 'JPY', 'ja-JP') → "¥12"
```

**Alternatives Considered**:
- Hardcoded strings: Violates constitution (Section III - i18next mandatory)
- Dynamic currency detection: Deferred for MVP (USD only initially)

**Reference**: VideoQ Constitution III (User Experience - i18next mandatory)

## Implementation Recommendations

### Phase 1 (MVP - Core Billing)
1. Stripe Checkout integration with 3 fixed plans
2. Webhook handlers for subscription lifecycle
3. Basic usage tracking (Redis + PostgreSQL)
4. Frontend: Plan selection + usage dashboard

### Phase 2 (Enhancements)
1. Email notifications (80%, 90%, 100% usage warnings)
2. Admin panel for custom plans
3. Billing history and invoice download
4. Multi-currency support

### Phase 3 (Advanced)
1. Team/organization accounts
2. Annual billing option with discount
3. Usage analytics and forecasting
4. Referral credits

## Open Questions (Post-MVP)

1. Should Premium tier truly be "unlimited videos" or cap at 1000?
   - **Recommendation**: Start with null (unlimited), monitor abuse, add soft cap if needed

2. What happens to videos when user downgrades below current count?
   - **Recommendation**: Keep videos but mark as "archived", prevent new uploads until under limit

3. Should we support pay-as-you-go overage charges?
   - **Recommendation**: No for MVP - simpler to require upgrade for predictable pricing

## References

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Checkout Best Practices](https://stripe.com/docs/payments/checkout/fulfill-orders)
- [SaaS Pricing Models (Stripe Guide)](https://stripe.com/resources/more/saas-pricing-models-101)
- [OpenAI Whisper API Pricing](https://openai.com/api/pricing/) - $0.006/minute
- [VideoQ Constitution v1.0.0](./.specify/memory/constitution.md)
