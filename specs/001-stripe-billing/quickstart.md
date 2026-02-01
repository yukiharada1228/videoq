# Quickstart: Stripe Billing Implementation

**Feature**: 001-stripe-billing
**Date**: 2026-02-01
**Target Audience**: Developers implementing the billing system

## Overview

This guide provides a step-by-step quickstart for implementing the Stripe billing system. Follow these steps in order to build the feature incrementally and validate each component.

## Prerequisites

1. **Stripe Account**: Create a Stripe account at https://stripe.com
2. **Stripe Test Keys**: Obtain test API keys from Stripe Dashboard → Developers → API keys
3. **Environment Variables**: Add to `.env` or environment:
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...  # From Stripe CLI or Dashboard
   ```

4. **Install Dependencies**:
   ```bash
   # Backend
   cd backend
   pip install stripe>=10.15.0
   pip freeze > requirements.txt

   # Frontend (if using Stripe Elements later)
   cd frontend
   npm install @stripe/stripe-js
   ```

## Phase 1: Data Models (Backend)

### Step 1.1: Create Billing Models

**File**: `backend/app/models/billing.py`

```python
from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator

User = get_user_model()

class SubscriptionPlan(models.Model):
    """Subscription tier with pricing and limits"""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=50, unique=True, db_index=True)
    description = models.TextField(null=True, blank=True)
    price_cents = models.IntegerField(validators=[MinValueValidator(0)], default=0)
    currency = models.CharField(max_length=3, default='USD')
    video_limit = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    transcription_limit_minutes = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    stripe_price_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_product_id = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['is_active', 'sort_order']),
        ]
        ordering = ['sort_order']

    def __str__(self):
        return f"{self.name} (${self.price_cents/100:.2f})"

class UserSubscription(models.Model):
    """User's active subscription"""
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('trialing', 'Trialing'),
        ('past_due', 'Past Due'),
        ('cancelled', 'Cancelled'),
        ('incomplete', 'Incomplete'),
        ('incomplete_expired', 'Incomplete Expired'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='subscription')
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT)
    stripe_subscription_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_customer_id = models.CharField(max_length=255, db_index=True, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active', db_index=True)
    current_period_start = models.DateTimeField()
    current_period_end = models.DateTimeField()
    cancel_at_period_end = models.BooleanField(default=False)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    trial_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'current_period_end']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.plan.name} ({self.status})"

# Add UsageRecord, TranscriptionJob, PaymentTransaction models (see data-model.md)
```

### Step 1.2: Create Migration

```bash
cd backend
python manage.py makemigrations app --name add_billing_models
python manage.py migrate
```

### Step 1.3: Seed Initial Plans

**File**: `backend/app/management/commands/seed_plans.py`

```python
from django.core.management.base import BaseCommand
from app.models.billing import SubscriptionPlan

class Command(BaseCommand):
    help = 'Seed initial subscription plans'

    def handle(self, *args, **options):
        plans = [
            {'name': 'Free', 'slug': 'free', 'price_cents': 0, 'video_limit': 3, 'transcription_limit_minutes': 30, 'sort_order': 0},
            {'name': 'Standard', 'slug': 'standard', 'price_cents': 1200, 'video_limit': 50, 'transcription_limit_minutes': 300, 'sort_order': 1},
            {'name': 'Premium', 'slug': 'premium', 'price_cents': 4900, 'video_limit': None, 'transcription_limit_minutes': 1000, 'sort_order': 2},
        ]

        for plan_data in plans:
            plan, created = SubscriptionPlan.objects.get_or_create(slug=plan_data['slug'], defaults=plan_data)
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created plan: {plan.name}'))
            else:
                self.stdout.write(self.style.WARNING(f'Plan already exists: {plan.name}'))
```

Run: `python manage.py seed_plans`

## Phase 2: Stripe Integration (Backend)

### Step 2.1: Stripe Service Layer

**File**: `backend/app/services/billing/stripe_service.py`

```python
import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

class StripeService:
    """Handles Stripe API interactions"""

    @staticmethod
    def create_customer(user):
        """Create Stripe customer for user"""
        return stripe.Customer.create(
            email=user.email,
            metadata={'user_id': user.id, 'username': user.username}
        )

    @staticmethod
    def create_checkout_session(user, plan, success_url, cancel_url):
        """Create Stripe Checkout session for subscription"""
        # Get or create Stripe customer
        if not hasattr(user, 'subscription') or not user.subscription.stripe_customer_id:
            customer = StripeService.create_customer(user)
            customer_id = customer.id
        else:
            customer_id = user.subscription.stripe_customer_id

        return stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': plan.stripe_price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={'user_id': user.id, 'plan_id': plan.id}
        )

    @staticmethod
    def cancel_subscription(subscription_id, at_period_end=True):
        """Cancel Stripe subscription"""
        return stripe.Subscription.modify(
            subscription_id,
            cancel_at_period_end=at_period_end
        )

    @staticmethod
    def verify_webhook_signature(payload, signature):
        """Verify Stripe webhook signature"""
        return stripe.Webhook.construct_event(
            payload, signature, settings.STRIPE_WEBHOOK_SECRET
        )
```

### Step 2.2: Usage Tracking Service

**File**: `backend/app/services/billing/usage_tracker.py`

```python
from django.core.cache import cache
from django.utils import timezone
from app.models.billing import UsageRecord

class UsageTracker:
    """Tracks resource usage with Redis caching"""

    @staticmethod
    def get_cache_key(user_id, period_start):
        """Generate Redis cache key"""
        return f"usage:{user_id}:{period_start.isoformat()}"

    @classmethod
    def get_usage(cls, user):
        """Get current billing period usage (Redis first, DB fallback)"""
        subscription = user.subscription
        cache_key = cls.get_cache_key(user.id, subscription.current_period_start)

        # Try Redis first
        cached = cache.get(cache_key)
        if cached:
            return cached

        # Fallback to PostgreSQL
        usage, _ = UsageRecord.objects.get_or_create(
            user=user,
            billing_period_start=subscription.current_period_start,
            billing_period_end=subscription.current_period_end,
            defaults={'video_count': 0, 'transcription_seconds': 0}
        )

        # Cache for 5 minutes
        usage_dict = {
            'video_count': usage.video_count,
            'transcription_seconds': usage.transcription_seconds,
            'updated_at': timezone.now().isoformat()
        }
        cache.set(cache_key, usage_dict, 300)
        return usage_dict

    @classmethod
    def can_upload_video(cls, user):
        """Check if user can upload based on limits"""
        subscription = user.subscription
        plan = subscription.plan

        if plan.video_limit is None:
            return True, ""

        usage = cls.get_usage(user)
        if usage['video_count'] >= plan.video_limit:
            return False, f"Video limit reached ({plan.video_limit}/{plan.video_limit}). Upgrade to upload more."

        return True, ""

    @classmethod
    def increment_video_count(cls, user):
        """Increment video upload counter"""
        subscription = user.subscription
        cache_key = cls.get_cache_key(user.id, subscription.current_period_start)

        # Atomic increment in Redis
        cache.hincrby(cache_key, 'video_count', 1)

        # Update PostgreSQL (async via Celery task recommended)
        usage, _ = UsageRecord.objects.get_or_create(
            user=user,
            billing_period_start=subscription.current_period_start,
            billing_period_end=subscription.current_period_end,
            defaults={'video_count': 0, 'transcription_seconds': 0}
        )
        usage.video_count += 1
        usage.save(update_fields=['video_count', 'updated_at'])
```

## Phase 3: API Endpoints (Backend)

### Step 3.1: Serializers

**File**: `backend/app/serializers/billing.py`

```python
from rest_framework import serializers
from app.models.billing import SubscriptionPlan, UserSubscription, UsageRecord

class SubscriptionPlanSerializer(serializers.ModelSerializer):
    price_display = serializers.SerializerMethodField()
    features = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionPlan
        fields = ['id', 'name', 'slug', 'description', 'price_cents', 'price_display',
                  'currency', 'video_limit', 'transcription_limit_minutes', 'features', 'sort_order']

    def get_price_display(self, obj):
        return f"${obj.price_cents / 100:.2f}/month" if obj.price_cents > 0 else "Free"

    def get_features(self, obj):
        features = []
        if obj.video_limit:
            features.append(f"{obj.video_limit} videos")
        else:
            features.append("Unlimited videos")

        if obj.transcription_limit_minutes:
            hours = obj.transcription_limit_minutes / 60
            features.append(f"{hours:.1f} hours transcription/month")
        return features

class UserSubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = UserSubscription
        fields = ['id', 'plan', 'status', 'current_period_start', 'current_period_end',
                  'cancel_at_period_end', 'cancelled_at', 'created_at']
```

### Step 3.2: Views

**File**: `backend/app/views/billing/subscription_views.py`

```python
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from app.models.billing import SubscriptionPlan
from app.serializers.billing import SubscriptionPlanSerializer, UserSubscriptionSerializer
from app.services.billing.stripe_service import StripeService

@api_view(['GET'])
def list_plans(request):
    """Public endpoint: List all active plans"""
    plans = SubscriptionPlan.objects.filter(is_active=True)
    serializer = SubscriptionPlanSerializer(plans, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_subscription(request):
    """Get authenticated user's subscription"""
    if not hasattr(request.user, 'subscription'):
        return Response({'error': 'No active subscription'}, status=status.HTTP_404_NOT_FOUND)

    serializer = UserSubscriptionSerializer(request.user.subscription)
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_checkout_session(request):
    """Create Stripe Checkout session for upgrade"""
    plan_id = request.data.get('plan_id')
    success_url = request.data.get('success_url', 'http://localhost:3000/billing/success')
    cancel_url = request.data.get('cancel_url', 'http://localhost:3000/billing')

    try:
        plan = SubscriptionPlan.objects.get(id=plan_id, is_active=True)
    except SubscriptionPlan.DoesNotExist:
        return Response({'error': 'Invalid plan'}, status=status.HTTP_400_BAD_REQUEST)

    # Create Stripe Checkout session
    session = StripeService.create_checkout_session(request.user, plan, success_url, cancel_url)

    return Response({
        'checkout_url': session.url,
        'session_id': session.id
    })
```

### Step 3.3: URL Routing

**File**: `backend/app/urls.py` (add to existing routes)

```python
from app.views.billing import subscription_views

urlpatterns = [
    # ... existing routes ...
    path('billing/plans', subscription_views.list_plans, name='list_plans'),
    path('billing/subscription', subscription_views.get_subscription, name='get_subscription'),
    path('billing/subscription/checkout', subscription_views.create_checkout_session, name='create_checkout'),
]
```

## Phase 4: Frontend (React/TypeScript)

### Step 4.1: Types

**File**: `frontend/src/types/billing.ts`

```typescript
export interface SubscriptionPlan {
  id: number
  name: string
  slug: string
  description: string
  price_cents: number
  price_display: string
  currency: string
  video_limit: number | null
  transcription_limit_minutes: number | null
  features: string[]
  sort_order: number
}

export interface UserSubscription {
  id: number
  plan: SubscriptionPlan
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'incomplete'
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  cancelled_at: string | null
  created_at: string
}
```

### Step 4.2: API Client

**File**: `frontend/src/services/billing.ts`

```typescript
import { api } from './api'  // Existing API client
import { SubscriptionPlan, UserSubscription } from '@/types/billing'

export const billingService = {
  async getPlans(): Promise<SubscriptionPlan[]> {
    const response = await api.get('/billing/plans')
    return response.data
  },

  async getSubscription(): Promise<UserSubscription> {
    const response = await api.get('/billing/subscription')
    return response.data
  },

  async createCheckoutSession(planId: number): Promise<{ checkout_url: string }> {
    const response = await api.post('/billing/subscription/checkout', {
      plan_id: planId,
      success_url: `${window.location.origin}/billing/success`,
      cancel_url: `${window.location.origin}/billing`
    })
    return response.data
  }
}
```

### Step 4.3: React Hook

**File**: `frontend/src/hooks/useBilling.ts`

```typescript
import { useState, useEffect } from 'react'
import { billingService } from '@/services/billing'
import { SubscriptionPlan, UserSubscription } from '@/types/billing'

export function useSubscription() {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    billingService.getSubscription()
      .then(setSubscription)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  const upgrade = async (planId: number) => {
    const { checkout_url } = await billingService.createCheckoutSession(planId)
    window.location.href = checkout_url
  }

  return { subscription, loading, error, upgrade }
}

export function usePlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    billingService.getPlans().then(setPlans).finally(() => setLoading(false))
  }, [])

  return { plans, loading }
}
```

### Step 4.4: Plan Card Component

**File**: `frontend/src/components/billing/PlanCard.tsx`

```tsx
import { SubscriptionPlan } from '@/types/billing'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface PlanCardProps {
  plan: SubscriptionPlan
  onSelect: () => void
  isCurrent?: boolean
}

export function PlanCard({ plan, onSelect, isCurrent }: PlanCardProps) {
  return (
    <Card className="p-6">
      <h3 className="text-2xl font-bold">{plan.name}</h3>
      <p className="text-gray-600 mt-2">{plan.description}</p>
      <div className="text-4xl font-bold mt-4">{plan.price_display}</div>

      <ul className="mt-6 space-y-2">
        {plan.features.map((feature, idx) => (
          <li key={idx} className="flex items-center">
            <span className="mr-2">✓</span> {feature}
          </li>
        ))}
      </ul>

      <Button
        onClick={onSelect}
        disabled={isCurrent}
        className="w-full mt-6"
      >
        {isCurrent ? 'Current Plan' : 'Select Plan'}
      </Button>
    </Card>
  )
}
```

## Phase 5: Testing

### Step 5.1: Backend Tests

**File**: `backend/tests/services/test_usage_tracker.py`

```python
from django.test import TestCase
from django.contrib.auth import get_user_model
from app.models.billing import SubscriptionPlan, UserSubscription, UsageRecord
from app.services.billing.usage_tracker import UsageTracker
from django.utils import timezone
from datetime import timedelta

User = get_user_model()

class UsageTrackerTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', email='test@example.com')
        self.plan = SubscriptionPlan.objects.create(
            name='Test Plan',
            slug='test',
            video_limit=5,
            transcription_limit_minutes=60
        )
        self.subscription = UserSubscription.objects.create(
            user=self.user,
            plan=self.plan,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30)
        )

    def test_can_upload_video_under_limit(self):
        allowed, message = UsageTracker.can_upload_video(self.user)
        self.assertTrue(allowed)
        self.assertEqual(message, "")

    def test_cannot_upload_video_at_limit(self):
        # Create usage at limit
        UsageRecord.objects.create(
            user=self.user,
            billing_period_start=self.subscription.current_period_start,
            billing_period_end=self.subscription.current_period_end,
            video_count=5  # At limit
        )

        allowed, message = UsageTracker.can_upload_video(self.user)
        self.assertFalse(allowed)
        self.assertIn("limit reached", message.lower())
```

### Step 5.2: Frontend Tests

**File**: `frontend/src/components/billing/__tests__/PlanCard.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanCard } from '../PlanCard'

describe('PlanCard', () => {
  const mockPlan = {
    id: 1,
    name: 'Standard',
    slug: 'standard',
    description: 'For professionals',
    price_cents: 1200,
    price_display: '$12.00/month',
    currency: 'USD',
    video_limit: 50,
    transcription_limit_minutes: 300,
    features: ['50 videos', '5 hours transcription/month'],
    sort_order: 1
  }

  it('renders plan details', () => {
    render(<PlanCard plan={mockPlan} onSelect={() => {}} />)
    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(screen.getByText('$12.00/month')).toBeInTheDocument()
  })

  it('calls onSelect when button clicked', () => {
    const onSelect = vi.fn()
    render(<PlanCard plan={mockPlan} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Select Plan'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('disables button for current plan', () => {
    render(<PlanCard plan={mockPlan} onSelect={() => {}} isCurrent={true} />)
    expect(screen.getByText('Current Plan')).toBeDisabled()
  })
})
```

## Phase 6: Stripe Setup

### Step 6.1: Create Products in Stripe Dashboard

1. Go to Stripe Dashboard → Products
2. Create "VideoQ Standard" product
3. Add recurring price: $12.00/month
4. Copy Price ID (e.g., `price_1O...`) to plan.stripe_price_id

### Step 6.2: Configure Webhooks

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local backend
stripe listen --forward-to localhost:8000/api/billing/webhook/stripe

# Copy webhook signing secret to .env as STRIPE_WEBHOOK_SECRET
```

## Next Steps

1. Implement webhook handler (see `research.md` Section 3)
2. Add email notifications for usage warnings
3. Implement admin panel for custom plans
4. Add billing history page
5. Set up monitoring for failed webhooks

## Useful Commands

```bash
# Backend
python manage.py seed_plans              # Seed subscription plans
python manage.py migrate                 # Run migrations
python manage.py test tests.services     # Run backend tests

# Frontend
npm run test                             # Run frontend tests
npm run dev                              # Start dev server

# Stripe
stripe listen --forward-to ...           # Test webhooks locally
stripe trigger checkout.session.completed # Trigger test event
```

## References

- [Full API Specification](./contracts/billing-api.yaml)
- [Data Model Documentation](./data-model.md)
- [Research Findings](./research.md)
- [Stripe Checkout Docs](https://stripe.com/docs/payments/checkout)
