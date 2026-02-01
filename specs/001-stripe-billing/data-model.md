# Data Model: Stripe Billing with Usage-Based Limits

**Feature**: 001-stripe-billing
**Date**: 2026-02-01
**Status**: Design Complete

## Overview

This document defines the database schema for the billing system, including subscription plans, user subscriptions, usage tracking, and payment transactions. All models follow Django ORM conventions and VideoQ's existing database patterns.

## Entity Relationship Diagram

```
┌─────────────────┐         ┌──────────────────┐
│ SubscriptionPlan│◄────────┤ UserSubscription │
│                 │  1    N │                  │
│ - id            │         │ - id             │
│ - name          │         │ - user_id (FK)   │
│ - slug          │         │ - plan_id (FK)   │
│ - price_cents   │         │ - stripe_sub_id  │
│ - video_limit   │         │ - status         │
│ - transcription │         │ - period_start   │
│ - stripe_price  │         │ - period_end     │
│ - is_active     │         │ - created_at     │
│ - created_at    │         │ - updated_at     │
└─────────────────┘         └──────────────────┘
                                     │
                                     │ 1
                                     │
                                     │ N
                            ┌────────▼────────┐
                            │  UsageRecord    │
                            │                 │
                            │ - id            │
                            │ - user_id (FK)  │
                            │ - period_start  │
                            │ - period_end    │
                            │ - video_count   │
                            │ - trans_seconds │
                            │ - updated_at    │
                            └─────────────────┘

┌─────────────────┐         ┌──────────────────┐
│      Video      │         │ TranscriptionJob │
│                 │  1    1 │                  │
│ - id            ├────────►│ - id             │
│ - user_id (FK)  │         │ - video_id (FK)  │
│ - title         │         │ - duration_sec   │
│ - status        │         │ - cost_cents     │
│ - uploaded_at   │         │ - whisper_model  │
│ - ...           │         │ - stripe_usage   │
└─────────────────┘         │ - created_at     │
                            │ - completed_at   │
                            └──────────────────┘

┌─────────────────┐
│ PaymentTransaction│
│                 │
│ - id            │
│ - user_id (FK)  │
│ - subscription  │
│ - stripe_txn_id │
│ - amount_cents  │
│ - currency      │
│ - type          │
│ - status        │
│ - created_at    │
└─────────────────┘
```

## Model Definitions

### 1. SubscriptionPlan

**Purpose**: Defines available subscription tiers with pricing and limits

**Fields**:

| Field Name | Type | Constraints | Description |
|------------|------|-------------|-------------|
| `id` | BigAutoField | PK | Primary key |
| `name` | CharField(100) | NOT NULL, unique | Display name (e.g., "Free", "Standard", "Premium") |
| `slug` | SlugField(50) | NOT NULL, unique, indexed | URL-safe identifier (e.g., "free", "standard", "premium") |
| `description` | TextField | NULL | Marketing description for plan card |
| `price_cents` | IntegerField | NOT NULL, default=0 | Monthly price in cents (e.g., 1200 = $12.00) |
| `currency` | CharField(3) | NOT NULL, default='USD' | ISO 4217 currency code |
| `video_limit` | IntegerField | NULL | Max videos allowed (null = unlimited) |
| `transcription_limit_minutes` | IntegerField | NULL | Max transcription minutes per billing period (null = unlimited) |
| `stripe_price_id` | CharField(255) | NULL, unique | Stripe Price ID (e.g., "price_1O...") |
| `stripe_product_id` | CharField(255) | NULL | Stripe Product ID (e.g., "prod_1O...") |
| `is_active` | BooleanField | NOT NULL, default=True | Whether plan is available for new subscriptions |
| `sort_order` | IntegerField | NOT NULL, default=0 | Display order (0 = first) |
| `created_at` | DateTimeField | NOT NULL, auto_now_add | Creation timestamp |
| `updated_at` | DateTimeField | NOT NULL, auto_now | Last modification timestamp |

**Indexes**:
- `slug` (unique index)
- `is_active, sort_order` (composite index for listing active plans)

**Validation Rules**:
- `price_cents >= 0`
- `video_limit >= 0 OR NULL`
- `transcription_limit_minutes >= 0 OR NULL`
- `currency` must be valid ISO 4217 code (validated in model clean())
- At least one of `video_limit` or `transcription_limit_minutes` must be set for non-free plans

**Sample Data**:
```python
# Free Tier
SubscriptionPlan(
    name="Free",
    slug="free",
    description="Perfect for trying out VideoQ",
    price_cents=0,
    video_limit=3,
    transcription_limit_minutes=30,
    stripe_price_id=None,  # No Stripe integration for free tier
    is_active=True,
    sort_order=0
)

# Standard Tier
SubscriptionPlan(
    name="Standard",
    slug="standard",
    description="For individual professionals and researchers",
    price_cents=1200,  # $12.00
    video_limit=50,
    transcription_limit_minutes=300,  # 5 hours
    stripe_price_id="price_1O5K...",
    stripe_product_id="prod_1O5K...",
    is_active=True,
    sort_order=1
)

# Premium Tier
SubscriptionPlan(
    name="Premium",
    slug="premium",
    description="For power users and small teams",
    price_cents=4900,  # $49.00
    video_limit=None,  # Unlimited
    transcription_limit_minutes=1000,  # 16.67 hours
    stripe_price_id="price_1O5L...",
    stripe_product_id="prod_1O5L...",
    is_active=True,
    sort_order=2
)
```

---

### 2. UserSubscription

**Purpose**: Links users to their active subscription plan and tracks billing periods

**Fields**:

| Field Name | Type | Constraints | Description |
|------------|------|-------------|-------------|
| `id` | BigAutoField | PK | Primary key |
| `user` | ForeignKey(User) | NOT NULL, indexed, on_delete=CASCADE | Reference to User model |
| `plan` | ForeignKey(SubscriptionPlan) | NOT NULL, on_delete=PROTECT | Reference to SubscriptionPlan |
| `stripe_subscription_id` | CharField(255) | NULL, unique | Stripe Subscription ID (e.g., "sub_1O...") |
| `stripe_customer_id` | CharField(255) | NULL, indexed | Stripe Customer ID (e.g., "cus_1O...") |
| `status` | CharField(20) | NOT NULL, default='active', indexed | Subscription status (see enum below) |
| `current_period_start` | DateTimeField | NOT NULL | Current billing period start (UTC) |
| `current_period_end` | DateTimeField | NOT NULL | Current billing period end (UTC) |
| `cancel_at_period_end` | BooleanField | NOT NULL, default=False | Whether subscription cancels at period end |
| `cancelled_at` | DateTimeField | NULL | When subscription was cancelled (if applicable) |
| `trial_end` | DateTimeField | NULL | Trial period end (future feature) |
| `created_at` | DateTimeField | NOT NULL, auto_now_add | Subscription creation timestamp |
| `updated_at` | DateTimeField | NOT NULL, auto_now | Last modification timestamp |

**Status Enum** (`status` field):
- `'active'`: Subscription is active and paid
- `'trialing'`: In trial period (future feature)
- `'past_due'`: Payment failed, in grace period
- `'cancelled'`: Subscription cancelled, access revoked
- `'incomplete'`: Payment pending (initial checkout)
- `'incomplete_expired'`: Payment failed after 23 hours (Stripe default)

**Indexes**:
- `user_id` (unique index - one subscription per user)
- `stripe_subscription_id` (unique index)
- `stripe_customer_id` (index for lookup)
- `status, current_period_end` (composite index for billing cycle resets)

**Constraints**:
- One active subscription per user (enforced via unique constraint on `user_id` where `status IN ('active', 'trialing', 'past_due')`)
- `current_period_end > current_period_start`

**Relationships**:
- `user`: One-to-one with User (one active subscription per user)
- `plan`: Many-to-one with SubscriptionPlan (many users can have same plan)

**Sample Data**:
```python
UserSubscription(
    user_id=42,
    plan_id=2,  # Standard plan
    stripe_subscription_id="sub_1O5KaBC...",
    stripe_customer_id="cus_1O5KaBC...",
    status='active',
    current_period_start=datetime(2026, 2, 1, 14, 30, tzinfo=timezone.utc),
    current_period_end=datetime(2026, 3, 1, 14, 30, tzinfo=timezone.utc),
    cancel_at_period_end=False,
    created_at=datetime(2026, 2, 1, 14, 30, tzinfo=timezone.utc)
)
```

---

### 3. UsageRecord

**Purpose**: Tracks resource consumption within billing periods for limit enforcement and billing calculations

**Fields**:

| Field Name | Type | Constraints | Description |
|------------|------|-------------|-------------|
| `id` | BigAutoField | PK | Primary key |
| `user` | ForeignKey(User) | NOT NULL, indexed, on_delete=CASCADE | Reference to User model |
| `billing_period_start` | DateTimeField | NOT NULL | Billing period start (matches subscription period) |
| `billing_period_end` | DateTimeField | NOT NULL | Billing period end (matches subscription period) |
| `video_count` | IntegerField | NOT NULL, default=0 | Number of videos uploaded in period |
| `transcription_seconds` | IntegerField | NOT NULL, default=0 | Total transcription seconds consumed |
| `last_video_uploaded_at` | DateTimeField | NULL | Timestamp of most recent video upload |
| `last_transcription_at` | DateTimeField | NULL | Timestamp of most recent transcription |
| `notification_sent_at` | JSONField | NULL, default=dict | Tracks notification thresholds (e.g., {"80": "2026-02-15T10:00:00Z"}) |
| `updated_at` | DateTimeField | NOT NULL, auto_now | Last update timestamp |

**Indexes**:
- `user_id, billing_period_start` (unique composite index - one record per user per period)
- `billing_period_end` (index for archival queries)

**Constraints**:
- `video_count >= 0`
- `transcription_seconds >= 0`
- `billing_period_end > billing_period_start`

**Relationships**:
- `user`: Many-to-one with User (one user has many usage records across periods)

**Derived Fields** (computed in application logic, not stored):
- `transcription_minutes`: `transcription_seconds / 60`
- `usage_percentage_videos`: `(video_count / plan.video_limit) * 100`
- `usage_percentage_transcription`: `(transcription_seconds / (plan.transcription_limit_minutes * 60)) * 100`

**Sample Data**:
```python
UsageRecord(
    user_id=42,
    billing_period_start=datetime(2026, 2, 1, 14, 30, tzinfo=timezone.utc),
    billing_period_end=datetime(2026, 3, 1, 14, 30, tzinfo=timezone.utc),
    video_count=12,
    transcription_seconds=7200,  # 120 minutes
    last_video_uploaded_at=datetime(2026, 2, 20, 9, 15, tzinfo=timezone.utc),
    last_transcription_at=datetime(2026, 2, 20, 9, 20, tzinfo=timezone.utc),
    notification_sent_at={"80": "2026-02-18T10:00:00Z"},
    updated_at=datetime(2026, 2, 20, 9, 20, tzinfo=timezone.utc)
)
```

---

### 4. TranscriptionJob

**Purpose**: Audit trail for individual transcription operations with cost tracking

**Fields**:

| Field Name | Type | Constraints | Description |
|------------|------|-------------|-------------|
| `id` | BigAutoField | PK | Primary key |
| `video` | ForeignKey(Video) | NOT NULL, unique, on_delete=CASCADE | Reference to Video model (one-to-one) |
| `user` | ForeignKey(User) | NOT NULL, indexed, on_delete=CASCADE | Denormalized user reference for fast queries |
| `duration_seconds` | IntegerField | NOT NULL | Actual audio duration transcribed (from Whisper API) |
| `cost_cents` | IntegerField | NOT NULL | Calculated cost in cents (duration_seconds * 0.01 for $0.0001/sec) |
| `whisper_model` | CharField(50) | NOT NULL, default='whisper-1' | Whisper model used (e.g., "whisper-1", "gpt-4o-transcribe") |
| `stripe_usage_record_id` | CharField(255) | NULL | Stripe Usage Record ID (if metered billing used) |
| `status` | CharField(20) | NOT NULL, default='pending' | Job status (see enum below) |
| `error_message` | TextField | NULL | Error details if transcription failed |
| `created_at` | DateTimeField | NOT NULL, auto_now_add | Job creation timestamp |
| `started_at` | DateTimeField | NULL | When transcription processing started |
| `completed_at` | DateTimeField | NULL | When transcription completed successfully |

**Status Enum** (`status` field):
- `'pending'`: Queued for processing
- `'processing'`: Currently transcribing
- `'completed'`: Successfully completed
- `'failed'`: Transcription failed
- `'cancelled'`: User cancelled before completion

**Indexes**:
- `video_id` (unique index - one transcription per video)
- `user_id, created_at` (composite index for user's transcription history)
- `status, created_at` (composite index for monitoring failed jobs)

**Relationships**:
- `video`: One-to-one with Video model
- `user`: Many-to-one with User (denormalized from video.user for performance)

**Sample Data**:
```python
TranscriptionJob(
    video_id=1234,
    user_id=42,
    duration_seconds=300,  # 5 minutes
    cost_cents=30,  # 300 seconds * $0.0001/sec = $0.03 = 3 cents
    whisper_model='whisper-1',
    status='completed',
    created_at=datetime(2026, 2, 20, 9, 15, tzinfo=timezone.utc),
    started_at=datetime(2026, 2, 20, 9, 16, tzinfo=timezone.utc),
    completed_at=datetime(2026, 2, 20, 9, 20, tzinfo=timezone.utc)
)
```

---

### 5. PaymentTransaction

**Purpose**: Audit trail for all payment events from Stripe (invoices, refunds, disputes)

**Fields**:

| Field Name | Type | Constraints | Description |
|------------|------|-------------|-------------|
| `id` | BigAutoField | PK | Primary key |
| `user` | ForeignKey(User) | NOT NULL, indexed, on_delete=CASCADE | Reference to User model |
| `subscription` | ForeignKey(UserSubscription) | NULL, on_delete=SET_NULL | Reference to subscription (if applicable) |
| `stripe_transaction_id` | CharField(255) | NOT NULL, unique, indexed | Stripe Invoice/Charge/Refund ID |
| `stripe_event_id` | CharField(255) | NULL, indexed | Stripe Event ID (for idempotency) |
| `amount_cents` | IntegerField | NOT NULL | Amount in cents (negative for refunds) |
| `currency` | CharField(3) | NOT NULL, default='USD' | ISO 4217 currency code |
| `type` | CharField(30) | NOT NULL, indexed | Transaction type (see enum below) |
| `status` | CharField(20) | NOT NULL, indexed | Payment status (see enum below) |
| `description` | TextField | NULL | Human-readable description |
| `metadata` | JSONField | NULL, default=dict | Additional Stripe metadata |
| `created_at` | DateTimeField | NOT NULL, auto_now_add | Transaction record creation |
| `stripe_created_at` | DateTimeField | NOT NULL | Timestamp from Stripe event |

**Type Enum** (`type` field):
- `'subscription_payment'`: Monthly subscription charge
- `'subscription_refund'`: Subscription refund
- `'overage_charge'`: Usage overage charge (future feature)
- `'proration'`: Upgrade/downgrade proration adjustment
- `'dispute'`: Payment dispute/chargeback

**Status Enum** (`status` field):
- `'pending'`: Payment processing
- `'succeeded'`: Payment successful
- `'failed'`: Payment failed
- `'refunded'`: Payment refunded
- `'disputed'`: Dispute opened

**Indexes**:
- `stripe_transaction_id` (unique index)
- `stripe_event_id` (index for webhook idempotency)
- `user_id, created_at DESC` (composite index for billing history)
- `type, status` (composite index for reporting)

**Relationships**:
- `user`: Many-to-one with User
- `subscription`: Many-to-one with UserSubscription (nullable)

**Sample Data**:
```python
PaymentTransaction(
    user_id=42,
    subscription_id=5,
    stripe_transaction_id="in_1O5KaBC...",
    stripe_event_id="evt_1O5KaBC...",
    amount_cents=1200,  # $12.00
    currency='USD',
    type='subscription_payment',
    status='succeeded',
    description="Standard Plan - Feb 2026",
    metadata={"billing_period": "2026-02-01 to 2026-03-01"},
    created_at=datetime(2026, 2, 1, 14, 35, tzinfo=timezone.utc),
    stripe_created_at=datetime(2026, 2, 1, 14, 30, tzinfo=timezone.utc)
)
```

---

## Migrations Strategy

### Migration 1: Create Billing Tables

**File**: `backend/app/migrations/00XX_add_billing_models.py`

**Operations**:
1. Create `SubscriptionPlan` table with indexes
2. Create `UserSubscription` table with foreign keys and indexes
3. Create `UsageRecord` table with composite unique constraint
4. Create `TranscriptionJob` table with foreign keys
5. Create `PaymentTransaction` table with indexes

**Data Migration**:
```python
# Seed initial subscription plans
from app.models.billing import SubscriptionPlan

def seed_initial_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('app', 'SubscriptionPlan')

    SubscriptionPlan.objects.bulk_create([
        SubscriptionPlan(
            name="Free",
            slug="free",
            description="Perfect for trying out VideoQ",
            price_cents=0,
            video_limit=3,
            transcription_limit_minutes=30,
            is_active=True,
            sort_order=0
        ),
        SubscriptionPlan(
            name="Standard",
            slug="standard",
            description="For individual professionals",
            price_cents=1200,
            video_limit=50,
            transcription_limit_minutes=300,
            is_active=True,
            sort_order=1
        ),
        SubscriptionPlan(
            name="Premium",
            slug="premium",
            description="For power users and small teams",
            price_cents=4900,
            video_limit=None,
            transcription_limit_minutes=1000,
            is_active=True,
            sort_order=2
        ),
    ])
```

### Migration 2: Migrate Existing Users to Free Plan

**File**: `backend/app/migrations/00XX_migrate_users_to_free_plan.py`

**Operations**:
1. Create `UserSubscription` for all existing users linked to Free plan
2. Create initial `UsageRecord` for current billing period
3. Populate `video_count` from existing Video records
4. Set `transcription_seconds` to 0 (no historical data)

**Rollback Strategy**: Keep existing `User.video_limit` field for 2 releases, then deprecate

---

## Redis Cache Schema

**Key Patterns**:

```
# Current usage (hot path)
usage:{user_id}:{billing_period_start}
Value: Hash {"video_count": 12, "transcription_seconds": 7200, "updated_at": "2026-02-20T09:20:00Z"}
TTL: End of billing period + 7 days

# Subscription cache (session-level)
subscription:{user_id}
Value: JSON (serialized UserSubscription + Plan)
TTL: 1 hour

# Webhook idempotency (prevent duplicate processing)
webhook:processed:{stripe_event_id}
Value: "1"
TTL: 7 days

# Notification sent tracking (prevent spam)
notification:sent:{user_id}:{threshold}
Value: "1" (e.g., notification:sent:42:80 = 80% warning sent)
TTL: 30 days
```

---

## State Machine Diagram (Subscription Status)

```
         ┌──────────────┐
         │ incomplete   │◄────── User clicks "Subscribe" (Stripe Checkout created)
         └──────┬───────┘
                │
                │ payment_succeeded
                ▼
         ┌──────────────┐
    ┌───►│   active     │◄────── Subscription active, usage allowed
    │    └──────┬───────┘
    │           │
    │           │ payment_failed
    │           ▼
    │    ┌──────────────┐
    │    │  past_due    │────────► 3 retries over 7 days (Stripe dunning)
    │    └──────┬───────┘
    │           │
    │           │ payment_succeeded (retry worked)
    │           │
    └───────────┘
                │
                │ final payment failed OR user cancels
                ▼
         ┌──────────────┐
         │  cancelled   │────────► Subscription ended, downgrade to Free
         └──────────────┘
```

---

## Performance Considerations

1. **Usage Queries**: Always check Redis first, fallback to PostgreSQL
2. **Subscription Lookups**: Cache in Redis for 1 hour to avoid DB hits
3. **Webhook Processing**: Async via Celery to return 200 OK within 5 seconds
4. **Composite Indexes**: Optimize for common queries (user billing history, active subscriptions)
5. **Partitioning**: Consider partitioning `TranscriptionJob` by `created_at` after 1M records

---

## Security Considerations

1. **Stripe IDs**: Never expose in frontend (use internal IDs only)
2. **Webhook Signature**: Always verify `stripe.Webhook.construct_event()` before processing
3. **RBAC**: Users can only view/modify their own subscriptions (enforced in views)
4. **Audit Trail**: `PaymentTransaction` immutable (no updates, only inserts)

---

## Validation Rules Summary

| Model | Field | Rule |
|-------|-------|------|
| SubscriptionPlan | `price_cents` | `>= 0` |
| SubscriptionPlan | `video_limit` | `>= 0 OR NULL` |
| SubscriptionPlan | `transcription_limit_minutes` | `>= 0 OR NULL` |
| UserSubscription | `current_period_end` | `> current_period_start` |
| UserSubscription | `user_id` | Unique per active subscription |
| UsageRecord | `video_count` | `>= 0` |
| UsageRecord | `transcription_seconds` | `>= 0` |
| TranscriptionJob | `duration_seconds` | `> 0` |
| TranscriptionJob | `cost_cents` | `= duration_seconds * 0.01` (rounded) |
| PaymentTransaction | `amount_cents` | Can be negative (refunds) |

---

## Next Steps

1. Implement Django models in `backend/app/models/billing.py`
2. Create database migrations
3. Write unit tests for model validation rules
4. Implement serializers for API exposure
5. Set up Redis caching layer
