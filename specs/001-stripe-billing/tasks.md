# Tasks: Stripe Billing with Usage-Based Limits

**Input**: Design documents from `/specs/001-stripe-billing/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/billing-api.yaml, research.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Coverage Target**: Backend ≥90%, Frontend ≥80% (per VideoQ Constitution)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Include exact file paths in descriptions

## Path Conventions

Per plan.md, this is a **web application** structure:
- Backend: `backend/app/` (Django)
- Frontend: `frontend/src/` (React + TypeScript)
- Tests: `backend/tests/` and `frontend/src/components/*/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment setup, dependencies, and Stripe configuration

- [ ] T001 Install stripe Python SDK (>=10.15.0) in backend/requirements.txt
- [ ] T002 [P] Configure Stripe API keys in backend environment variables (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET)
- [ ] T003 [P] Create backend/app/services/billing/ directory structure with __init__.py
- [ ] T004 [P] Create frontend/src/types/billing.ts for TypeScript interfaces
- [ ] T005 [P] Create frontend/src/services/billing.ts for API client
- [ ] T006 [P] Create frontend/src/hooks/useBilling.ts file structure
- [ ] T007 [P] Create frontend/src/components/billing/ directory structure
- [ ] T008 [P] Create frontend/src/locales/en/billing.json for English translations
- [ ] T009 [P] Create frontend/src/locales/ja/billing.json for Japanese translations

**Checkpoint**: Development environment ready with Stripe SDK and project structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data models and infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend Foundation

- [ ] T010 [P] Create SubscriptionPlan model in backend/app/models/billing.py with all fields from data-model.md
- [ ] T011 [P] Create UserSubscription model in backend/app/models/billing.py with status enum and billing period fields
- [ ] T012 [P] Create UsageRecord model in backend/app/models/billing.py with video_count and transcription_seconds tracking
- [ ] T013 [P] Create TranscriptionJob model in backend/app/models/billing.py for audit trail
- [ ] T014 [P] Create PaymentTransaction model in backend/app/models/billing.py for payment history
- [ ] T015 Create Django migration for all billing models in backend/app/migrations/00XX_add_billing_models.py
- [ ] T016 Create data migration to seed initial subscription plans (Free, Standard, Premium) in backend/app/migrations/00XX_seed_subscription_plans.py
- [ ] T017 Run migrations to create billing tables and seed plans
- [ ] T018 [P] Create SubscriptionPlanSerializer in backend/app/serializers/billing.py with price_display and features methods
- [ ] T019 [P] Create UserSubscriptionSerializer in backend/app/serializers/billing.py with nested plan
- [ ] T020 [P] Create UsageRecordSerializer in backend/app/serializers/billing.py with derived percentage fields
- [ ] T021 Register SubscriptionPlan model in Django admin (backend/app/admin.py) with inline editing

### Frontend Foundation

- [ ] T022 [P] Define SubscriptionPlan interface in frontend/src/types/billing.ts matching API contract
- [ ] T023 [P] Define UserSubscription interface in frontend/src/types/billing.ts matching API contract
- [ ] T024 [P] Define UsageRecord interface in frontend/src/types/billing.ts matching API contract
- [ ] T025 [P] Implement billingService.getPlans() in frontend/src/services/billing.ts
- [ ] T026 [P] Implement billingService.getSubscription() in frontend/src/services/billing.ts
- [ ] T027 [P] Implement useSubscription() hook in frontend/src/hooks/useBilling.ts with loading/error states
- [ ] T028 [P] Implement usePlans() hook in frontend/src/hooks/useBilling.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Free Tier User Uploads Video (Priority: P1) 🎯 MVP

**Goal**: Enforce video and transcription limits for free tier users with usage tracking

**Independent Test**: Create free tier user (3 videos, 30 min limit), upload 2 videos successfully, verify 3rd upload succeeds and 4th is rejected with actionable error message

### Backend Implementation

- [ ] T029 [P] [US1] Implement UsageTracker.get_usage() with Redis caching in backend/app/services/billing/usage_tracker.py
- [ ] T030 [P] [US1] Implement UsageTracker.can_upload_video() limit check in backend/app/services/billing/usage_tracker.py
- [ ] T031 [P] [US1] Implement UsageTracker.can_transcribe() limit check in backend/app/services/billing/usage_tracker.py
- [ ] T032 [P] [US1] Implement UsageTracker.increment_video_count() with Redis atomic increment in backend/app/services/billing/usage_tracker.py
- [ ] T033 [P] [US1] Implement UsageTracker.increment_transcription_seconds() in backend/app/services/billing/usage_tracker.py
- [ ] T034 [US1] Create GET /billing/usage endpoint in backend/app/views/billing/usage_views.py returning current period usage
- [ ] T035 [US1] Create POST /billing/usage/check endpoint in backend/app/views/billing/usage_views.py for pre-upload validation
- [ ] T036 [US1] Add URL routing for usage endpoints in backend/app/urls.py
- [ ] T037 [US1] Modify existing video upload view to call UsageTracker.can_upload_video() before accepting uploads
- [ ] T038 [US1] Modify transcription task to call increment_transcription_seconds() after completion in backend/app/tasks/transcription.py
- [ ] T039 [US1] Add i18next error messages for limit violations in frontend/src/locales/*/billing.json (keys: errors.video_limit_exceeded, errors.transcription_limit_exceeded)

### Backend Tests (≥90% Coverage)

- [ ] T040 [P] [US1] Unit test for UsageTracker.can_upload_video() under limit in backend/tests/services/test_usage_tracker.py
- [ ] T041 [P] [US1] Unit test for UsageTracker.can_upload_video() at limit in backend/tests/services/test_usage_tracker.py
- [ ] T042 [P] [US1] Unit test for Redis cache hit/miss behavior in backend/tests/services/test_usage_tracker.py
- [ ] T043 [P] [US1] API test for GET /billing/usage with usage data in backend/tests/views/test_billing_views.py
- [ ] T044 [P] [US1] API test for POST /billing/usage/check returning allowed=true in backend/tests/views/test_billing_views.py
- [ ] T045 [P] [US1] API test for POST /billing/usage/check returning allowed=false when at limit in backend/tests/views/test_billing_views.py
- [ ] T046 [P] [US1] Integration test: video upload rejection when limit reached in backend/tests/integration/test_video_limits.py

### Frontend Implementation

- [ ] T047 [P] [US1] Implement billingService.getUsage() in frontend/src/services/billing.ts
- [ ] T048 [P] [US1] Implement billingService.checkUsageLimit() in frontend/src/services/billing.ts
- [ ] T049 [US1] Create useUsage() hook with auto-refresh (60s interval) in frontend/src/hooks/useBilling.ts
- [ ] T050 [US1] Create UsageDashboard component in frontend/src/components/billing/UsageDashboard.tsx with progress bars for video count and transcription minutes
- [ ] T051 [US1] Add UsageDashboard to appropriate page (e.g., dashboard or account settings)
- [ ] T052 [US1] Modify video upload UI to call checkUsageLimit() before upload and show error if rejected

### Frontend Tests (≥80% Coverage)

- [ ] T053 [P] [US1] Unit test for UsageDashboard component rendering progress bars in frontend/src/components/billing/__tests__/UsageDashboard.test.tsx
- [ ] T054 [P] [US1] Unit test for UsageDashboard showing 80% warning in frontend/src/components/billing/__tests__/UsageDashboard.test.tsx
- [ ] T055 [P] [US1] Unit test for UsageDashboard showing 100% error state in frontend/src/components/billing/__tests__/UsageDashboard.test.tsx

**Checkpoint**: Free tier users can upload videos within limits, see usage dashboard, and receive actionable errors when limit reached

---

## Phase 4: User Story 2 - User Upgrades to Paid Tier (Priority: P1) 🎯 MVP

**Goal**: Enable users to subscribe to Standard/Premium plans via Stripe Checkout with immediate limit increases

**Independent Test**: Free user at limit selects Standard plan, completes Stripe Checkout (test mode), verify subscription upgraded and new limits applied immediately

### Backend Implementation

- [ ] T056 [P] [US2] Implement StripeService.create_customer() in backend/app/services/billing/stripe_service.py
- [ ] T057 [P] [US2] Implement StripeService.create_checkout_session() in backend/app/services/billing/stripe_service.py
- [ ] T058 [P] [US2] Implement StripeService.verify_webhook_signature() in backend/app/services/billing/stripe_service.py
- [ ] T059 [P] [US2] Implement WebhookHandler.handle_checkout_completed() in backend/app/services/billing/webhook_handler.py to create/update UserSubscription
- [ ] T060 [P] [US2] Implement WebhookHandler.handle_subscription_updated() in backend/app/services/billing/webhook_handler.py
- [ ] T061 [P] [US2] Implement WebhookHandler.handle_payment_succeeded() in backend/app/services/billing/webhook_handler.py
- [ ] T062 [P] [US2] Implement WebhookHandler.handle_payment_failed() in backend/app/services/billing/webhook_handler.py
- [ ] T063 [US2] Create Celery task for async webhook processing in backend/app/tasks/billing.py with idempotency check via Redis
- [ ] T064 [US2] Create GET /billing/plans endpoint (public) in backend/app/views/billing/subscription_views.py
- [ ] T065 [US2] Create GET /billing/subscription endpoint in backend/app/views/billing/subscription_views.py
- [ ] T066 [US2] Create POST /billing/subscription/checkout endpoint in backend/app/views/billing/subscription_views.py
- [ ] T067 [US2] Create POST /billing/webhook/stripe endpoint in backend/app/views/billing/webhook_views.py calling Celery task
- [ ] T068 [US2] Add URL routing for all subscription endpoints in backend/app/urls.py
- [ ] T069 [US2] Create management command to sync Stripe products/prices in backend/app/management/commands/sync_stripe_plans.py

### Backend Tests (≥90% Coverage)

- [ ] T070 [P] [US2] Unit test for StripeService.create_checkout_session() in backend/tests/services/test_stripe_service.py
- [ ] T071 [P] [US2] Unit test for webhook signature verification in backend/tests/services/test_stripe_service.py
- [ ] T072 [P] [US2] Unit test for WebhookHandler.handle_checkout_completed() creating UserSubscription in backend/tests/services/test_webhook_handler.py
- [ ] T073 [P] [US2] API test for GET /billing/plans returning all active plans in backend/tests/views/test_billing_views.py
- [ ] T074 [P] [US2] API test for POST /billing/subscription/checkout returning Stripe session URL in backend/tests/views/test_billing_views.py
- [ ] T075 [P] [US2] API test for POST /billing/webhook/stripe with valid signature in backend/tests/views/test_billing_views.py
- [ ] T076 [P] [US2] API test for POST /billing/webhook/stripe with invalid signature (should reject) in backend/tests/views/test_billing_views.py
- [ ] T077 [P] [US2] Integration test: end-to-end upgrade flow from free to standard tier in backend/tests/integration/test_upgrade_flow.py

### Frontend Implementation

- [ ] T078 [P] [US2] Create PlanCard component in frontend/src/components/billing/PlanCard.tsx displaying plan details and price
- [ ] T079 [P] [US2] Create PlanSelector component in frontend/src/components/billing/PlanSelector.tsx with grid of PlanCards
- [ ] T080 [US2] Implement billingService.createCheckoutSession() in frontend/src/services/billing.ts
- [ ] T081 [US2] Add upgrade() method to useSubscription hook in frontend/src/hooks/useBilling.ts (redirects to Stripe Checkout)
- [ ] T082 [US2] Create BillingPage in frontend/src/pages/BillingPage.tsx showing current plan and PlanSelector
- [ ] T083 [US2] Create CheckoutSuccessPage in frontend/src/pages/CheckoutSuccessPage.tsx showing confirmation and new limits
- [ ] T084 [US2] Add routing for /billing and /billing/success in frontend/src/App.tsx
- [ ] T085 [US2] Add i18next translations for plan names, descriptions, and checkout flow in frontend/src/locales/*/billing.json

### Frontend Tests (≥80% Coverage)

- [ ] T086 [P] [US2] Unit test for PlanCard component rendering plan details in frontend/src/components/billing/__tests__/PlanCard.test.tsx
- [ ] T087 [P] [US2] Unit test for PlanCard calling onSelect when button clicked in frontend/src/components/billing/__tests__/PlanCard.test.tsx
- [ ] T088 [P] [US2] Unit test for PlanCard disabled state for current plan in frontend/src/components/billing/__tests__/PlanCard.test.tsx
- [ ] T089 [P] [US2] Unit test for PlanSelector rendering multiple plans in frontend/src/components/billing/__tests__/PlanSelector.test.tsx
- [ ] T090 [P] [US2] Unit test for BillingPage integration in frontend/src/pages/__tests__/BillingPage.test.tsx

### Stripe Setup

- [ ] T091 [US2] Create Standard plan product in Stripe Dashboard with price_id
- [ ] T092 [US2] Create Premium plan product in Stripe Dashboard with price_id
- [ ] T093 [US2] Update SubscriptionPlan records with Stripe price_id and product_id via Django admin
- [ ] T094 [US2] Configure Stripe webhook endpoint URL in Stripe Dashboard pointing to /billing/webhook/stripe
- [ ] T095 [US2] Test webhook delivery using Stripe CLI (stripe listen --forward-to localhost:8000/api/billing/webhook/stripe)

**Checkpoint**: Users can upgrade from Free to Standard/Premium via Stripe Checkout, limits increase immediately, webhooks process successfully

---

## Phase 5: User Story 3 - Paid User Monitors Usage (Priority: P2)

**Goal**: Provide comprehensive usage dashboard with warnings at 80%, 90%, 100% thresholds

**Independent Test**: Paid user uploads videos to reach 80% usage, verify warning notification appears, upload to 100%, verify limit enforcement

### Backend Implementation

- [ ] T096 [P] [US3] Implement Celery periodic task to check usage thresholds in backend/app/tasks/billing.py
- [ ] T097 [P] [US3] Implement notification service to send 80%/90%/100% warning emails in backend/app/services/billing/notification_service.py
- [ ] T098 [US3] Add email templates for usage warnings in backend/app/templates/emails/usage_warning_*.html
- [ ] T099 [US3] Configure Celery beat schedule for hourly usage threshold checks in backend/videoq/celery.py
- [ ] T100 [US3] Create GET /billing/history endpoint in backend/app/views/billing/subscription_views.py returning PaymentTransactions
- [ ] T101 [US3] Add URL routing for billing history endpoint in backend/app/urls.py

### Backend Tests (≥90% Coverage)

- [ ] T102 [P] [US3] Unit test for usage threshold detection (79% vs 80%) in backend/tests/tasks/test_billing_tasks.py
- [ ] T103 [P] [US3] Unit test for notification sent only once per threshold in backend/tests/tasks/test_billing_tasks.py
- [ ] T104 [P] [US3] API test for GET /billing/history returning transactions in backend/tests/views/test_billing_views.py

### Frontend Implementation

- [ ] T105 [P] [US3] Add warning indicators to UsageDashboard component when >= 80% in frontend/src/components/billing/UsageDashboard.tsx
- [ ] T106 [P] [US3] Implement billingService.getBillingHistory() in frontend/src/services/billing.ts
- [ ] T107 [US3] Create BillingHistoryTable component in frontend/src/components/billing/BillingHistoryTable.tsx
- [ ] T108 [US3] Add billing history tab to BillingPage in frontend/src/pages/BillingPage.tsx
- [ ] T109 [US3] Add i18next translations for warning messages and history labels in frontend/src/locales/*/billing.json

### Frontend Tests (≥80% Coverage)

- [ ] T110 [P] [US3] Unit test for warning indicator appearing at 80% in frontend/src/components/billing/__tests__/UsageDashboard.test.tsx
- [ ] T111 [P] [US3] Unit test for BillingHistoryTable rendering transactions in frontend/src/components/billing/__tests__/BillingHistoryTable.test.tsx

**Checkpoint**: Users receive timely warnings before hitting limits and can view billing history

---

## Phase 6: User Story 4 - User Downgrades Subscription (Priority: P2)

**Goal**: Allow users to cancel or downgrade subscription with clear communication about when changes take effect

**Independent Test**: Standard user requests downgrade to Free, verify confirmation shows period end date, period ends, verify limits adjusted and user receives confirmation

### Backend Implementation

- [ ] T112 [P] [US4] Implement StripeService.cancel_subscription() with at_period_end flag in backend/app/services/billing/stripe_service.py
- [ ] T113 [P] [US4] Implement Celery periodic task to process period-end downgrades in backend/app/tasks/billing.py
- [ ] T114 [US4] Create POST /billing/subscription/cancel endpoint in backend/app/views/billing/subscription_views.py
- [ ] T115 [US4] Create POST /billing/subscription/reactivate endpoint in backend/app/views/billing/subscription_views.py
- [ ] T116 [US4] Add URL routing for cancel/reactivate endpoints in backend/app/urls.py
- [ ] T117 [US4] Add email template for downgrade confirmation in backend/app/templates/emails/downgrade_confirmed.html

### Backend Tests (≥90% Coverage)

- [ ] T118 [P] [US4] Unit test for cancel_subscription with at_period_end=True in backend/tests/services/test_stripe_service.py
- [ ] T119 [P] [US4] API test for POST /billing/subscription/cancel setting cancel_at_period_end flag in backend/tests/views/test_billing_views.py
- [ ] T120 [P] [US4] API test for POST /billing/subscription/reactivate clearing cancellation in backend/tests/views/test_billing_views.py
- [ ] T121 [P] [US4] Integration test for period-end downgrade process in backend/tests/integration/test_downgrade_flow.py

### Frontend Implementation

- [ ] T122 [P] [US4] Implement billingService.cancelSubscription() in frontend/src/services/billing.ts
- [ ] T123 [P] [US4] Implement billingService.reactivateSubscription() in frontend/src/services/billing.ts
- [ ] T124 [US4] Create SubscriptionSettings component in frontend/src/components/billing/SubscriptionSettings.tsx with cancel/reactivate buttons
- [ ] T125 [US4] Add SubscriptionSettings to BillingPage in frontend/src/pages/BillingPage.tsx
- [ ] T126 [US4] Add confirmation dialog for cancel action using existing Dialog component
- [ ] T127 [US4] Show pending cancellation status and reactivate option in SubscriptionSettings
- [ ] T128 [US4] Add i18next translations for downgrade flow messages in frontend/src/locales/*/billing.json

### Frontend Tests (≥80% Coverage)

- [ ] T129 [P] [US4] Unit test for SubscriptionSettings showing cancel button in frontend/src/components/billing/__tests__/SubscriptionSettings.test.tsx
- [ ] T130 [P] [US4] Unit test for confirmation dialog appearing on cancel in frontend/src/components/billing/__tests__/SubscriptionSettings.test.tsx
- [ ] T131 [P] [US4] Unit test for showing reactivate option when cancellation pending in frontend/src/components/billing/__tests__/SubscriptionSettings.test.tsx

**Checkpoint**: Users can downgrade subscriptions with clear communication about timing and impact

---

## Phase 7: User Story 5 - Administrator Manages Custom Plans (Priority: P3)

**Goal**: Enable administrators to create custom pricing plans for enterprise customers via Django admin

**Independent Test**: Admin creates custom plan with 100 videos and 500 minutes, assigns to test user, verify user sees new limits

### Backend Implementation

- [ ] T132 [P] [US5] Enhance SubscriptionPlan admin with custom actions for plan duplication in backend/app/admin.py
- [ ] T133 [P] [US5] Add UserSubscription inline to User admin for plan assignment in backend/app/admin.py
- [ ] T134 [P] [US5] Create custom admin action to manually sync Stripe product/price for custom plans in backend/app/admin.py
- [ ] T135 [US5] Add validation to prevent deletion of plans with active subscriptions in backend/app/models/billing.py
- [ ] T136 [US5] Add audit logging for plan creation/modification in backend/app/admin.py

### Backend Tests (≥90% Coverage)

- [ ] T137 [P] [US5] Unit test for preventing plan deletion with active subscriptions in backend/tests/models/test_subscription_plan.py
- [ ] T138 [P] [US5] Integration test for admin creating and assigning custom plan in backend/tests/integration/test_admin_custom_plans.py

### Frontend Implementation

No frontend changes required - admin functionality uses Django admin interface

**Checkpoint**: Administrators can create and manage custom plans for enterprise customers

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, performance optimization, and documentation

- [ ] T139 [P] Add comprehensive API documentation using drf-spectacular in backend/app/views/billing/
- [ ] T140 [P] Add Redis cache warming on server startup for frequently accessed plans in backend/app/apps.py
- [ ] T141 [P] Implement rate limiting for billing API endpoints (5 req/min per user) in backend/app/middleware/
- [ ] T142 [P] Add structured logging for all billing operations (checkout, webhooks, limit checks) in backend/app/services/billing/
- [ ] T143 [P] Create monitoring dashboard queries for billing metrics (conversion rate, failed payments) in backend/app/management/commands/billing_metrics.py
- [ ] T144 [P] Add accessibility audit for billing UI components (WCAG AA compliance) in frontend/src/components/billing/
- [ ] T145 [P] Optimize bundle size by code-splitting billing pages in frontend/vite.config.ts
- [ ] T146 [P] Add error boundary for billing pages in frontend/src/App.tsx
- [ ] T147 [P] Create quickstart validation script that runs through all user stories in tests/
- [ ] T148 Run full test suite and verify ≥90% backend, ≥80% frontend coverage
- [ ] T149 Security audit: verify no Stripe secrets in frontend bundle, webhook signature always checked
- [ ] T150 Performance test: verify API p95 <200ms for /billing/usage/check under load

**Checkpoint**: Feature is production-ready with monitoring, logging, and performance optimizations

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T009) completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational (T010-T028) completion
  - US1, US2, US3, US4, US5 can then proceed in parallel (if staffed)
  - Or sequentially in priority order: US1 → US2 → US3 → US4 → US5
- **Polish (Phase 8)**: Depends on MVP user stories (US1, US2) being complete minimum

### MVP Definition

**Minimum Viable Product = User Story 1 + User Story 2**

Reasoning:
- US1 provides core value: limit enforcement for free users
- US2 provides monetization: upgrade to paid plans
- Together they form a complete billing system
- US3, US4, US5 are enhancements that can be added incrementally

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational - No dependencies on other stories
- **US2 (P1)**: Can start after Foundational - Integrates with US1 but independently testable
- **US3 (P2)**: Can start after Foundational - Enhances US1/US2 but independently functional
- **US4 (P2)**: Can start after Foundational - Depends on US2 (need subscriptions to cancel)
- **US5 (P3)**: Can start after Foundational - No dependencies on other stories

### Within Each User Story

1. Backend tests BEFORE backend implementation (if practicing TDD)
2. Models before services (services depend on models)
3. Services before views/endpoints (endpoints depend on services)
4. Backend API before frontend (frontend depends on API contracts)
5. Frontend components before tests (tests depend on components)

### Parallel Opportunities

**Setup Phase (T001-T009)**: All 9 tasks can run in parallel (different files)

**Foundational Phase (T010-T028)**:
- Backend models (T010-T014) can run in parallel
- Frontend types/interfaces (T022-T024) can run in parallel
- Frontend services (T025-T026) can run in parallel
- Frontend hooks (T027-T028) can run in parallel
- Migration (T015-T017) must run after models complete

**User Stories**: If team has 2+ developers, different stories can proceed in parallel after Foundational:
- Dev 1: US1 (limit enforcement)
- Dev 2: US2 (Stripe checkout)
- Both then collaborate on US3, US4, US5

**Within US1 (T029-T055)**:
- Backend services (T029-T033) can run in parallel
- Backend tests (T040-T046) can run in parallel after implementation
- Frontend implementation (T047-T052) can run in parallel after API ready
- Frontend tests (T053-T055) can run in parallel after components ready

**Within US2 (T056-T095)**:
- Backend services (T056-T062) can run in parallel
- Backend tests (T070-T077) can run in parallel after implementation
- Frontend components (T078-T079) can run in parallel
- Frontend tests (T086-T090) can run in parallel after components ready
- Stripe setup (T091-T095) can run in parallel with development

---

## Parallel Example: MVP (US1 + US2)

Assume 2 developers working in parallel:

### Week 1: Foundational (Sequential)

```bash
# Both devs collaborate or one handles backend, one handles frontend
T010-T028  # Foundation must complete before story work
```

### Week 2-3: User Story 1 + User Story 2 (Parallel)

```bash
# Dev 1: Focus on US1 (Limit Enforcement)
T029-T055  # All US1 tasks

# Dev 2: Focus on US2 (Stripe Checkout)
T056-T095  # All US2 tasks

# These run in parallel after Foundational complete
```

### Week 4: Integration Testing & Polish

```bash
# Both devs
T147  # Quickstart validation
T148  # Full test suite
T149  # Security audit
T150  # Performance testing
```

**Total MVP Timeline**: ~4 weeks with 2 developers working in parallel

---

## Implementation Strategy

### Recommended Approach: MVP-First

1. **Sprint 1 (2 weeks)**: Phase 1 (Setup) + Phase 2 (Foundational)
   - Complete T001-T028
   - Checkpoint: Models, serializers, and basic hooks ready

2. **Sprint 2 (2 weeks)**: Phase 3 (US1) - Limit Enforcement
   - Complete T029-T055
   - Checkpoint: Free users can upload videos within limits

3. **Sprint 3 (3 weeks)**: Phase 4 (US2) - Stripe Integration
   - Complete T056-T095
   - Checkpoint: Users can upgrade to paid plans via Stripe
   - **MVP RELEASE** - Feature is now monetizable

4. **Sprint 4 (1 week)**: Phase 5 (US3) - Usage Monitoring
   - Complete T096-T111
   - Checkpoint: Users receive usage warnings

5. **Sprint 5 (1 week)**: Phase 6 (US4) - Downgrade Flow
   - Complete T112-T131
   - Checkpoint: Users can cancel subscriptions gracefully

6. **Sprint 6 (1 week)**: Phase 7 (US5) + Phase 8 (Polish)
   - Complete T132-T150
   - Checkpoint: Feature complete with admin tools and optimizations

**Total Estimated Duration**: 10 weeks (2.5 months) for full feature

**Early MVP at 7 weeks**: Deliver US1 + US2 after Sprint 3 for revenue generation

---

## Task Summary

**Total Tasks**: 150
- **Setup**: 9 tasks (T001-T009)
- **Foundational**: 19 tasks (T010-T028)
- **US1 (P1)**: 27 tasks (T029-T055)
- **US2 (P1)**: 40 tasks (T056-T095)
- **US3 (P2)**: 16 tasks (T096-T111)
- **US4 (P2)**: 20 tasks (T112-T131)
- **US5 (P3)**: 7 tasks (T132-T138)
- **Polish**: 12 tasks (T139-T150)

**Parallelizable Tasks**: 68 tasks marked [P] can run concurrently

**MVP Scope**: 95 tasks (Setup + Foundational + US1 + US2) = ~7 weeks with 2 devs

**Coverage Targets**:
- Backend: ≥90% (enforced by 46 test tasks)
- Frontend: ≥80% (enforced by 20 test tasks)

---

## Success Validation

After completing all tasks, verify against success criteria from spec.md:

- ✓ **SC-001**: Free tier users can upload/transcribe videos within limits without payment
- ✓ **SC-002**: 90% of checkout flows complete within 5 minutes (measure in production)
- ✓ **SC-003**: Usage data accurate within 1 minute (verify Redis sync timing)
- ✓ **SC-004**: Zero billing discrepancies (audit Stripe vs internal records)
- ✓ **SC-005**: Webhook processing <30 seconds (verify Celery task timing)
- ✓ **SC-006**: 100% limit enforcement accuracy (test with boundary conditions)
- ✓ **SC-007**: Usage warnings within 5 minutes of threshold (verify notification timing)
- ✓ **SC-008**: Subscription changes reflected within 2 minutes (verify webhook→DB latency)

---

## Next Actions

1. **Review tasks with team** - Ensure all tasks are clear and actionable
2. **Assign US1 and US2 to developers** - Start MVP development
3. **Set up Stripe test account** - Complete T002 (API keys)
4. **Create project board** - Track task progress (Jira, GitHub Projects, etc.)
5. **Begin Sprint 1** - Execute T001-T028 (Setup + Foundational)

**Questions?** Refer to:
- [spec.md](spec.md) - Feature requirements and user stories
- [plan.md](plan.md) - Technical architecture and decisions
- [data-model.md](data-model.md) - Database schema details
- [quickstart.md](quickstart.md) - Developer implementation guide
- [research.md](research.md) - Design decisions and alternatives

---

**Task List Generated**: 2026-02-01
**Next Command**: Begin implementation with T001
