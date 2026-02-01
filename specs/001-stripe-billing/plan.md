# Implementation Plan: Stripe Billing with Usage-Based Limits

**Branch**: `001-stripe-billing` | **Date**: 2026-02-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-stripe-billing/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a comprehensive Stripe-based billing system with tiered subscription plans (Free, Standard, Premium) that enforce dual usage limits: video upload counts and transcription minutes. The system will track usage in real-time, integrate with Stripe webhooks for subscription lifecycle management, provide user-facing dashboards for usage monitoring, and handle upgrade/downgrade flows with appropriate proration and limit adjustments.

## Technical Context

**Language/Version**: Backend: Python 3.12 (Django 5.2.7), Frontend: TypeScript 5.9.3 (React 19.2.0)
**Primary Dependencies**: Django REST Framework, django-rest-framework-simplejwt, Celery 5.5.3, Redis 7.0.0, stripe>=10.15.0 (resolved: latest stable with webhook signature v2), React Router 7.1.3, Zod 4.1.12, i18next 24.2.0
**Storage**: PostgreSQL with pgvector (existing), S3/local storage for videos (existing)
**Testing**: Backend: Django TestCase (≥90% coverage target), Frontend: Vitest 3.2.2 with @testing-library/react (≥80% coverage target)
**Target Platform**: Linux server (backend), Modern browsers (frontend)
**Project Type**: Web application (Django backend + React SPA frontend)
**Performance Goals**: API p95 <200ms for limit checks, <30s for webhook processing, frontend TTI <5s
**Constraints**: WCAG AA accessibility compliance, i18next for all user-facing text, HttpOnly cookies for auth
**Scale/Scope**: Designed for 10k+ users, monthly billing cycles, real-time usage tracking, 12-month historical data retention

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Initial Check (Pre-Research) - PASSED ✓

Verify compliance with VideoQ Constitution v1.0.0:

- [x] **Code Quality**: Type safety strategy defined - TypeScript strict mode for frontend React components and services, Python type hints for all Django models, views, serializers, and services
- [x] **Testing Standards**: Test approach documented - Vitest for frontend billing UI components (≥80%), Django TestCase for backend subscription models, views, webhook handlers, and limit enforcement (≥90%)
- [x] **User Experience**: i18next integration for all billing UI text (plan names, usage labels, error messages), WCAG AA keyboard navigation for payment forms, user-friendly error messages for payment failures and limit violations with actionable guidance
- [x] **Performance**: API p95 <200ms for usage limit checks (critical path), webhook processing <30s, frontend TTI <5s for billing dashboard, Redis caching for current billing period usage to minimize DB queries
- [x] **Security**: JWT HttpOnly cookies for API auth (existing), Stripe webhook signature verification, secrets management via environment variables for Stripe API keys, input validation for all user-facing plan selection and payment forms
- [x] **Complexity Justification**: New Stripe dependency justified for payment processing (no viable simpler alternative), subscription state machine pattern required for managing billing lifecycle transitions

### Post-Design Check (After Phase 1) - PASSED ✓

**Re-validation after completing data model, contracts, and architecture design:**

- [x] **Code Quality**: All models in `data-model.md` include Python type hints, all frontend TypeScript interfaces defined in `contracts/billing-api.yaml` and `types/billing.ts`
- [x] **Testing Standards**: Test cases documented in `quickstart.md` covering model validation, API endpoints, and React components with target coverage
- [x] **User Experience**: i18next namespace structure defined in `quickstart.md` (Section 4.1), error messages follow actionable guidance pattern (see API contract error schemas)
- [x] **Performance**: Redis caching architecture documented in `data-model.md` (Redis Cache Schema section), usage query optimization via composite indexes defined
- [x] **Security**: Webhook signature verification documented in `research.md` (Section 3), Stripe IDs never exposed in frontend (see API contracts - only internal IDs returned)
- [x] **Complexity Justification**: All complexity items documented in Complexity Tracking table with clear rationale

**No violations found. Design proceeds to implementation phase.**

*Reference: `.specify/memory/constitution.md` for detailed requirements*

## Project Structure

### Documentation (this feature)

```text
specs/001-stripe-billing/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── models/
│   │   ├── billing.py                    # New: SubscriptionPlan, UserSubscription, UsageRecord, TranscriptionJob
│   │   └── user.py                       # Modified: Add subscription relationship
│   ├── services/
│   │   ├── billing/
│   │   │   ├── __init__.py
│   │   │   ├── stripe_service.py         # New: Stripe API integration
│   │   │   ├── subscription_service.py   # New: Subscription lifecycle management
│   │   │   ├── usage_tracker.py          # New: Usage tracking and limit enforcement
│   │   │   └── webhook_handler.py        # New: Stripe webhook processing
│   │   └── limits.py                     # New: Limit validation service
│   ├── views/
│   │   └── billing/
│   │       ├── __init__.py
│   │       ├── subscription_views.py     # New: Subscription CRUD, upgrade/downgrade
│   │       ├── usage_views.py            # New: Usage dashboard endpoints
│   │       └── webhook_views.py          # New: Stripe webhook receiver
│   ├── serializers/
│   │   └── billing.py                    # New: SubscriptionPlan, UserSubscription, UsageRecord serializers
│   ├── tasks/
│   │   ├── billing.py                    # New: Billing cycle reset, usage notifications
│   │   └── transcription.py              # Modified: Track transcription duration
│   ├── migrations/
│   │   └── 00XX_add_billing_models.py    # New: Create billing tables
│   └── admin.py                          # Modified: Add SubscriptionPlan admin
└── tests/
    ├── services/
    │   └── test_billing.py               # New: Billing service tests
    ├── views/
    │   └── test_billing_views.py         # New: Billing API tests
    └── tasks/
        └── test_billing_tasks.py         # New: Celery task tests

frontend/
├── src/
│   ├── components/
│   │   └── billing/
│   │       ├── PlanCard.tsx              # New: Subscription plan display
│   │       ├── PlanSelector.tsx          # New: Plan selection UI
│   │       ├── UsageDashboard.tsx        # New: Usage progress bars
│   │       ├── SubscriptionSettings.tsx  # New: Manage subscription
│   │       └── __tests__/                # New: Component tests
│   ├── pages/
│   │   ├── BillingPage.tsx               # New: Main billing page
│   │   └── CheckoutSuccessPage.tsx       # New: Post-payment redirect
│   ├── services/
│   │   └── billing.ts                    # New: Billing API client
│   ├── hooks/
│   │   └── useBilling.ts                 # New: Subscription and usage hooks
│   ├── types/
│   │   └── billing.ts                    # New: TypeScript interfaces
│   └── locales/
│       ├── en/
│       │   └── billing.json              # New: English billing strings
│       └── ja/
│           └── billing.json              # New: Japanese billing strings
└── tests/
    └── components/
        └── billing/                      # New: Billing component tests
```

**Structure Decision**: Web application structure (Option 2) selected to match existing Django backend + React frontend architecture. New billing functionality will be organized into dedicated modules within the existing `backend/app/` and `frontend/src/` directories following established patterns (models, services, views, components).

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected Because |
|------|------------|-------------------------------------|
| Stripe SDK dependency | Industry-standard payment processing with PCI compliance, fraud detection, dunning management, and webhook infrastructure built-in | Building custom payment processing would require PCI compliance certification (~$50k+), fraud detection system, and webhook infrastructure - prohibitively complex and expensive |
| Subscription state machine | Manage complex billing lifecycle transitions (active → past_due → cancelled, upgrade/downgrade, proration) with audit trail | Simple boolean flags cannot represent subscription status transitions, proration logic, or billing period boundaries accurately |
| Redis caching for usage | Sub-200ms p95 response time for limit checks on every video upload/transcription request (critical path) | Direct PostgreSQL queries for usage aggregation would exceed performance targets (~500ms+) under concurrent load |
| Separate UsageRecord and TranscriptionJob models | UsageRecord tracks billing period aggregates (fast queries), TranscriptionJob provides audit trail for disputes (12-month retention) | Single denormalized model would bloat usage queries with unnecessary audit data, violating performance constraints |

## Phase 0: Research (COMPLETED ✓)

**Output**: [research.md](research.md)

**Completed Activities**:
1. Investigated Stripe SDK version and integration approach → Decision: stripe>=10.15.0 with Stripe Checkout
2. Designed subscription tier pricing strategy → Three-tier model (Free $0, Standard $12, Premium $49)
3. Researched webhook event handling → Celery async processing with idempotency via Redis
4. Architected usage tracking system → Dual-layer Redis cache + PostgreSQL persistence
5. Designed billing cycle management → Monthly cycles with Stripe automatic proration
6. Evaluated frontend state management → React hooks with custom implementation (no new deps)
7. Defined i18next structure → Separate billing.json namespace with currency formatting

**Key Decisions**:
- Whisper API pricing confirmed: $0.006/min ($0.0001/sec)
- Stripe Checkout (hosted) selected over Stripe Elements (embedded)
- Redis cache layer justified for <200ms p95 performance target
- Monthly billing only for MVP (annual deferred)

## Phase 1: Design & Contracts (COMPLETED ✓)

**Outputs**:
- [data-model.md](data-model.md) - Complete database schema with 5 core models
- [contracts/billing-api.yaml](contracts/billing-api.yaml) - OpenAPI 3.0 specification for all billing endpoints
- [quickstart.md](quickstart.md) - Developer quickstart guide with code examples

**Completed Activities**:
1. **Data Model Design**: Defined 5 core entities with full field specifications, indexes, constraints, and validation rules:
   - `SubscriptionPlan`: Pricing tiers with Stripe integration
   - `UserSubscription`: User-plan linkage with billing period tracking
   - `UsageRecord`: Current period usage aggregation (Redis-backed)
   - `TranscriptionJob`: Individual transcription audit trail
   - `PaymentTransaction`: Payment event history from Stripe

2. **API Contracts**: OpenAPI spec with 9 endpoints across 4 resource categories:
   - Plans: `GET /billing/plans` (public)
   - Subscriptions: `GET|POST /billing/subscription/*` (checkout, cancel, reactivate)
   - Usage: `GET|POST /billing/usage/*` (current usage, limit checks)
   - Webhooks: `POST /billing/webhook/stripe` (Stripe event receiver)

3. **Quickstart Guide**: Step-by-step implementation guide with:
   - Django model implementations
   - Stripe service layer code
   - React hooks and components
   - Test examples (backend + frontend)
   - Stripe CLI setup instructions

4. **Agent Context Update**: Updated CLAUDE.md with new technology stack

## Phase 2: Task Generation (NEXT STEP)

**Command**: `/speckit.tasks`

**Expected Output**: `tasks.md` with dependency-ordered implementation tasks

**What Phase 2 Will Generate**:
1. Granular tasks for implementing each model, view, service, component
2. Task dependencies and ordering (e.g., "Implement SubscriptionPlan model" before "Create plan serializer")
3. Testing tasks for each component
4. Migration creation and data seeding tasks
5. Documentation and deployment tasks

**Estimated Task Count**: 40-60 tasks across backend, frontend, testing, and deployment

## Implementation Phases (Post-Planning)

### MVP (Phase 1 - Core Billing)
**Target**: Minimal viable billing system

**Backend Tasks**:
1. Create Django models (SubscriptionPlan, UserSubscription, UsageRecord)
2. Implement Stripe service layer (checkout, webhook verification)
3. Build usage tracker with Redis caching
4. Create API views (plans, subscription, usage check)
5. Write backend tests (≥90% coverage)

**Frontend Tasks**:
1. Create TypeScript types and API client
2. Build React hooks (useSubscription, usePlans)
3. Implement plan selection UI
4. Create usage dashboard component
5. Add i18next translations (en/ja)
6. Write frontend tests (≥80% coverage)

**Integration**:
1. Stripe product/price creation
2. Webhook endpoint configuration
3. Environment variable setup
4. Migration execution and plan seeding

**Acceptance Criteria**:
- Free users can upgrade to paid plan via Stripe Checkout
- Video upload blocked when limit reached
- Usage dashboard shows real-time consumption
- Webhooks update subscription status correctly

### Enhancements (Phase 2)
1. Email notifications (usage warnings at 80%, 90%, 100%)
2. Billing history page with invoice downloads
3. Admin panel for custom plan creation
4. Subscription cancellation flow
5. TranscriptionJob model for audit trail
6. PaymentTransaction tracking

### Advanced Features (Phase 3)
1. Team/organization accounts
2. Annual billing option with discount
3. Multi-currency support
4. Usage analytics and forecasting
5. Referral credits system

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Stripe webhook delivery failure | High - subscription status out of sync | Medium | Implement idempotency via Redis, add manual sync endpoint, monitor webhook failures in admin panel |
| Race condition on concurrent uploads | Medium - user exceeds limit | Low | Use Redis HINCRBY for atomic increments, add optimistic locking on DB writes |
| Redis cache data loss | Medium - incorrect usage tracking | Low | Sync to PostgreSQL every 5 minutes, rebuild cache from DB on miss |
| Stripe API rate limits | Medium - checkout failures | Very Low | Implement retry logic with exponential backoff, cache plan data |
| Migration from existing video_limit field | High - data loss if mishandled | Low | Keep old field for 2 releases, migrate data incrementally, add rollback plan |
| PCI compliance misconfiguration | Critical - security breach | Very Low | Use Stripe Checkout (PCI DSS compliant by default), never store card data, document secrets management |

## Success Metrics

**Technical Metrics**:
- API p95 latency: <200ms for `/billing/usage/check` (limit checks)
- Webhook processing time: <30s from receipt to DB update
- Test coverage: Backend ≥90%, Frontend ≥80%
- Redis cache hit rate: ≥95% for usage queries
- Zero billing discrepancies between Stripe and internal records

**Business Metrics**:
- Checkout completion rate: ≥80% (industry standard ~70%)
- Subscription upgrade conversion: ≥5% of free users within 30 days
- Payment failure rate: <2% (industry average ~3-5%)
- Support tickets related to billing: <1% of total tickets

## Development Timeline Estimate

**Note**: This is a rough estimate for planning purposes. Actual timeline depends on team size and velocity.

- **Phase 0 (Research)**: Completed ✓
- **Phase 1 (Design)**: Completed ✓
- **Phase 2 (Task Generation)**: Ready to run `/speckit.tasks`
- **MVP Implementation**: 3-4 sprints (6-8 weeks for 1-2 developers)
  - Sprint 1: Backend models, services, basic API
  - Sprint 2: Stripe integration, webhook handling
  - Sprint 3: Frontend UI, usage dashboard
  - Sprint 4: Testing, polish, deployment
- **Enhancements**: 1-2 sprints (2-4 weeks)
- **Advanced Features**: 2-3 sprints (4-6 weeks)

**Total Estimated Duration**: 8-14 weeks for complete implementation (MVP + Enhancements)

## Next Actions

1. **Run `/speckit.tasks`** to generate detailed implementation tasks
2. Review and prioritize generated tasks with team
3. Set up Stripe account and obtain API keys
4. Create initial SubscriptionPlan products in Stripe Dashboard
5. Begin MVP implementation following quickstart.md guide

## References

- **Feature Specification**: [spec.md](spec.md)
- **Research Findings**: [research.md](research.md)
- **Data Model**: [data-model.md](data-model.md)
- **API Contracts**: [contracts/billing-api.yaml](contracts/billing-api.yaml)
- **Developer Quickstart**: [quickstart.md](quickstart.md)
- **VideoQ Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md)
- **Stripe Documentation**: https://stripe.com/docs
- **OpenAI Whisper Pricing**: https://openai.com/api/pricing/

---

**Plan Status**: ✅ COMPLETE - Ready for task generation and implementation

**Last Updated**: 2026-02-01
**Next Command**: `/speckit.tasks` (generate implementation tasks)
