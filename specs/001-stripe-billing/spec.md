# Feature Specification: Stripe Billing with Usage-Based Limits

**Feature Branch**: `001-stripe-billing`
**Created**: 2026-02-01
**Status**: Draft
**Input**: User description: "将来的にstripeによる課金を実装したいです。その際に必要なユーザーごとの制限を設計していきたいです。課金体系からどのようにすればいいか考えてください。現在は動画数のみの制限を管理者画面で設定できるようにしていますが、文字起こしにwhisperapiを使うためその制限を考えたいです。whisperは処理の秒数で課金がされる気がします。その点も調査して検討してください"

## User Scenarios & Testing

### User Story 1 - Free Tier User Uploads Video (Priority: P1)

A new user signs up for the free tier and uploads their first video to test the transcription service.

**Why this priority**: This is the core onboarding flow and demonstrates value immediately. Without this, users cannot evaluate the product.

**Independent Test**: Can be fully tested by creating a free tier account, uploading a single video under limits, and verifying transcription completes without payment.

**Acceptance Scenarios**:

1. **Given** a new user on free tier with no usage, **When** they upload a 5-minute video, **Then** the video is accepted, transcribed, and their usage counter shows 5 minutes consumed
2. **Given** a free tier user with 8 minutes remaining, **When** they upload a 10-minute video, **Then** the system rejects the upload with a message explaining they need to upgrade or have 2 minutes remaining
3. **Given** a free tier user with 3 minutes remaining, **When** they upload a 2-minute video, **Then** the upload succeeds and they see 1 minute remaining

---

### User Story 2 - User Upgrades to Paid Tier (Priority: P1)

A user who has exhausted their free tier limits decides to upgrade to a paid subscription plan.

**Why this priority**: This is the primary monetization flow and must work seamlessly to generate revenue.

**Independent Test**: Can be fully tested by having a free user select a paid plan, complete checkout, and verify their limits increase immediately.

**Acceptance Scenarios**:

1. **Given** a free tier user at their limit, **When** they select a paid tier and complete payment, **Then** their account is upgraded and new limits are applied immediately
2. **Given** a user on the checkout page, **When** they view plan options, **Then** they see clear comparison of video count limits and transcription minutes for each tier
3. **Given** a user completing payment, **When** payment succeeds, **Then** they receive confirmation email with their new plan details and limits
4. **Given** a user completing payment, **When** payment fails, **Then** they remain on free tier and see clear error message with retry option

---

### User Story 3 - Paid User Monitors Usage (Priority: P2)

A paid tier user wants to track their monthly usage to avoid unexpected overages or plan changes.

**Why this priority**: Usage transparency builds trust and helps users self-manage their subscription level.

**Independent Test**: Can be fully tested by a paid user uploading videos and viewing their usage dashboard showing real-time consumption.

**Acceptance Scenarios**:

1. **Given** a paid user with current month usage, **When** they view their account dashboard, **Then** they see remaining video slots and transcription minutes with visual progress indicators
2. **Given** a user at 80% of either limit, **When** they log in, **Then** they see a notification warning about approaching limit
3. **Given** a user who exceeded soft limits, **When** they view usage, **Then** they see overage amounts and associated costs

---

### User Story 4 - User Downgrades Subscription (Priority: P2)

A paid user wants to reduce costs by downgrading to a lower tier or returning to free tier.

**Why this priority**: Allowing flexible downgrading reduces churn and maintains goodwill, even if it means less immediate revenue.

**Independent Test**: Can be fully tested by a paid user selecting a lower tier and verifying limits adjust at next billing cycle.

**Acceptance Scenarios**:

1. **Given** a paid user with current subscription, **When** they request downgrade, **Then** they see confirmation showing when new limits take effect and what happens to existing content
2. **Given** a user downgrading to a tier below current usage, **When** downgrade is confirmed, **Then** they receive clear warning about content that will become inaccessible
3. **Given** a downgrade scheduled for next billing cycle, **When** the cycle renews, **Then** limits are adjusted and user receives confirmation

---

### User Story 5 - Administrator Manages Custom Plans (Priority: P3)

An administrator needs to create custom pricing plans for enterprise customers or special promotions.

**Why this priority**: Custom plans are important for enterprise sales but not required for initial launch.

**Independent Test**: Can be fully tested by admin creating a custom plan and assigning it to a test user.

**Acceptance Scenarios**:

1. **Given** an administrator in the admin panel, **When** they create a custom plan with specific limits, **Then** the plan is available for assignment to users
2. **Given** an administrator viewing a user, **When** they assign a custom plan, **Then** the user's limits update immediately to reflect the custom plan
3. **Given** a user on a custom plan, **When** the admin modifies plan limits, **Then** the user sees updated limits without requiring re-subscription

---

### Edge Cases

- What happens when a user cancels mid-month after using 80% of their monthly limits?
- How does the system handle race conditions when a user uploads multiple videos simultaneously near their limit?
- What occurs if Stripe webhook delivery fails after successful payment?
- How are refunds handled when a user was charged for overages they dispute?
- What happens to queued video processing jobs when a user hits their limit mid-processing?
- How does the system handle users who had unlimited access in the old system transitioning to new tiered limits?
- What happens when transcription duration exceeds video duration due to processing overhead?

## Requirements

### Functional Requirements

- **FR-001**: System MUST define at least three subscription tiers: Free, Standard, and Premium
- **FR-002**: System MUST enforce video count limits per user based on their subscription tier
- **FR-003**: System MUST track transcription usage in seconds consumed per billing period
- **FR-004**: System MUST prevent video uploads when user has reached video count limit
- **FR-005**: System MUST prevent transcription when user has reached transcription time limit
- **FR-006**: System MUST display current usage and remaining limits to users in their dashboard
- **FR-007**: System MUST support subscription upgrades with immediate limit increases
- **FR-008**: System MUST support subscription downgrades effective at next billing cycle
- **FR-009**: System MUST handle Stripe webhook events for subscription lifecycle (created, updated, cancelled, payment_succeeded, payment_failed)
- **FR-010**: System MUST calculate transcription costs based on actual audio duration processed by Whisper API (billed per second at $0.0001/second)
- **FR-011**: System MUST reset monthly usage counters at the start of each billing period
- **FR-012**: System MUST allow administrators to create and assign custom subscription plans
- **FR-013**: System MUST provide grace period behavior when users exceed soft limits (defined as allowing completion of current operation but blocking new ones)
- **FR-014**: System MUST send email notifications when users reach 80%, 90%, and 100% of any limit
- **FR-015**: System MUST maintain historical usage records for at least 12 months for billing disputes
- **FR-016**: Users MUST be able to view their subscription details including current plan, next billing date, and payment method
- **FR-017**: Users MUST be able to cancel their subscription with confirmation of when access will be downgraded
- **FR-018**: System MUST handle failed payments with retry logic and dunning management as per standard practices
- **FR-019**: System MUST support proration when users upgrade mid-billing cycle
- **FR-020**: System MUST maintain existing videos when user downgrades, but prevent new uploads if over new limit

### Key Entities

- **Subscription Plan**: Represents a pricing tier with associated limits and price. Attributes include plan name, monthly price, video upload limit, monthly transcription minutes limit, and feature flags for future expansion.

- **User Subscription**: Links a user to their active subscription plan. Attributes include user reference, plan reference, subscription status (active, cancelled, past_due, trialing), current billing period start/end dates, and next billing date.

- **Usage Record**: Tracks consumption of limited resources within a billing period. Attributes include user reference, billing period, video count used, transcription seconds used, and timestamp of last update.

- **Transcription Job**: Records individual transcription operations for auditing. Attributes include video reference, audio duration in seconds, cost calculated, processing timestamp, and Whisper API response metadata.

- **Payment Transaction**: Records payment events from Stripe. Attributes include user reference, amount, currency, transaction type (subscription, overage), Stripe transaction ID, status, and timestamp.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Free tier users can successfully upload and transcribe videos within their limits without payment information
- **SC-002**: 90% of subscription upgrade flows complete checkout within 5 minutes
- **SC-003**: Users can view their current usage and remaining limits with data accuracy within 1 minute of actual usage
- **SC-004**: Zero billing discrepancies between actual Whisper API costs and user charges over a 30-day period
- **SC-005**: System processes subscription webhook events from payment provider within 30 seconds of receipt
- **SC-006**: Limit enforcement prevents 100% of over-limit operations while allowing all under-limit operations
- **SC-007**: Users receive usage warning notifications within 5 minutes of crossing 80%, 90%, or 100% thresholds
- **SC-008**: Subscription changes (upgrade/downgrade/cancel) are reflected in user account within 2 minutes

## Assumptions

- Whisper API pricing remains stable at $0.006 per minute ($0.0001 per second) as documented in OpenAI's current pricing
- Transcription duration roughly equals video audio duration (1:1 ratio) for quota calculation purposes
- Users will accept monthly subscription billing cycles rather than annual-only options
- The existing video limit field in User model can be repurposed or migrated to plan-based limits
- Initial launch will focus on individual users rather than team/organization accounts
- Payment processing will use Stripe Checkout hosted pages rather than custom embedded forms
- Video storage costs are absorbed into subscription price rather than metered separately
- Free tier will have restrictive but non-zero limits to allow product evaluation (suggested: 3 videos, 30 minutes transcription per month)
- Standard tier will target individual professionals (suggested: 50 videos, 300 minutes transcription per month at ~$10-15/month)
- Premium tier will target power users (suggested: unlimited videos, 1000 minutes transcription per month at ~$30-50/month)

## Out of Scope

- Team or organization multi-user accounts
- Annual billing cycles (monthly only for initial launch)
- One-time video purchase or pay-per-video options
- Custom Whisper API alternatives or self-hosted transcription
- Referral programs or promotional credits
- API access for programmatic video uploads
- White-label or reseller capabilities
- Integration with payment providers other than Stripe
- Tax calculation and VAT/GST handling (will use Stripe Tax if needed post-launch)
- Detailed video analytics or transcription quality metrics beyond usage tracking
