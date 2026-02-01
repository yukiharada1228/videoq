# Feature Specification: Stripe CLI Docker Compose Integration

**Feature Branch**: `180-t002-configure-stripe-api-keys-in-backend-environment-variables-stripe_secret_key-stripe_publishable_key-stripe_webhook_secret`
**Created**: 2026-02-01
**Status**: Draft
**Input**: User description: "stripe cliをdocker composeで管理したいと思っています"

## User Scenarios & Testing

### User Story 1 - Developer Tests Stripe Webhooks Locally (Priority: P1)

A developer working on the Stripe billing feature needs to test webhook events locally during development without manually creating events in Stripe Dashboard.

**Why this priority**: This is the core development workflow improvement that enables rapid iteration on webhook handling code.

**Independent Test**: Can be fully tested by starting the Stripe CLI container, triggering a test webhook event, and verifying the backend receives and processes it correctly.

**Acceptance Scenarios**:

1. **Given** the development environment is running via Docker Compose, **When** the developer starts all services, **Then** the Stripe CLI container automatically connects and forwards webhooks to the backend
2. **Given** the Stripe CLI is connected, **When** the developer triggers a test event using `stripe trigger`, **Then** the backend receives the webhook and logs the event processing
3. **Given** a webhook endpoint is being developed, **When** the developer makes code changes, **Then** they can immediately test by triggering events without redeploying or reconfiguring

---

### User Story 2 - Team Shares Consistent Webhook Development Environment (Priority: P2)

Multiple developers on the team need to have identical Stripe webhook testing environments without manual CLI installation or configuration.

**Why this priority**: Consistency across development environments prevents "works on my machine" issues and accelerates team onboarding.

**Independent Test**: Can be fully tested by having a new team member clone the repository, run `docker compose up`, and successfully receive webhook events without additional setup.

**Acceptance Scenarios**:

1. **Given** a new developer clones the repository, **When** they run `docker compose up` with proper environment variables, **Then** the Stripe CLI starts and forwards webhooks without additional installation steps
2. **Given** multiple developers are testing webhooks, **When** they use the containerized CLI, **Then** each developer's local environment receives their own webhook events independently
3. **Given** the Stripe CLI configuration changes, **When** the Docker Compose config is updated, **Then** all team members get the updated configuration by pulling and restarting containers

---

### User Story 3 - Developer Monitors Webhook Traffic (Priority: P2)

A developer debugging a webhook integration needs to see real-time webhook traffic and inspect payloads.

**Why this priority**: Visibility into webhook events is essential for debugging and verifying correct implementation.

**Independent Test**: Can be fully tested by triggering webhook events and viewing the Stripe CLI logs showing event details and forwarding status.

**Acceptance Scenarios**:

1. **Given** the Stripe CLI container is running, **When** webhook events are received, **Then** the developer can view detailed logs via `docker compose logs stripe-cli`
2. **Given** a webhook fails to process, **When** the developer checks Stripe CLI logs, **Then** they see error details including HTTP status codes and response bodies
3. **Given** multiple webhook events are triggered, **When** the developer inspects logs, **Then** they can see the sequence and timing of all events

---

### Edge Cases

- What happens when the Stripe CLI container restarts and needs to re-authenticate?
- How does the system handle network connectivity issues between Stripe CLI and Stripe servers?
- What occurs if the backend container is not ready when Stripe CLI starts forwarding events?
- How are webhook secrets managed across local development, staging, and production environments?
- What happens when multiple developers use the same Stripe API keys?
- How does the CLI handle rate limits on webhook forwarding?

## Requirements

### Functional Requirements

- **FR-001**: System MUST include a Stripe CLI service in docker-compose.yml
- **FR-002**: Stripe CLI container MUST authenticate using environment variables (STRIPE_API_KEY or STRIPE_DEVICE_NAME)
- **FR-003**: Stripe CLI MUST forward webhooks to the backend service using the internal Docker network
- **FR-004**: Stripe CLI MUST listen on the backend's webhook endpoint path (e.g., `/api/webhooks/stripe/`)
- **FR-005**: System MUST persist Stripe CLI authentication across container restarts
- **FR-006**: Stripe CLI logs MUST be accessible via standard Docker Compose logging commands
- **FR-007**: Stripe CLI MUST start after backend service is healthy (dependency management)
- **FR-008**: Environment variables MUST include STRIPE_WEBHOOK_ENDPOINT to configure the forwarding target
- **FR-009**: System MUST document how to trigger test events using the containerized CLI
- **FR-010**: System MUST handle Stripe CLI version updates via Docker image tag specification

### Key Entities

- **Stripe CLI Service**: Docker Compose service definition for the Stripe CLI container. Attributes include image version, command configuration, environment variables, network configuration, and volume mounts.

- **Webhook Configuration**: Environment variables and command flags that define webhook forwarding behavior. Attributes include target URL, webhook signing secret, and event filtering options.

- **Authentication Credentials**: Secure storage and injection of Stripe API credentials. Attributes include API key reference, device name, and authentication persistence mechanism.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Developers can start the entire development stack including Stripe CLI with a single `docker compose up` command
- **SC-002**: Webhook events forwarded by Stripe CLI reach the backend within 2 seconds of being triggered
- **SC-003**: Stripe CLI authentication persists across container restarts without requiring manual re-login
- **SC-004**: 100% of test webhook events triggered via `stripe trigger` are successfully forwarded to the backend
- **SC-005**: New developers can receive their first webhook event within 5 minutes of cloning the repository (assuming Stripe credentials are provided)

## Assumptions

- Developers have access to Stripe API test keys
- The backend webhook endpoint is implemented and ready to receive events
- Docker and Docker Compose are installed on developer machines
- The backend service exposes webhook endpoints internally on the Docker network
- Stripe CLI official Docker image is available and maintained by Stripe
- Local development does not require production-level webhook security (HTTPS not required for localhost)
- Webhook signing secret verification is handled by the backend application code
- Each developer will use their own Stripe test account or share team test keys

## Out of Scope

- Production webhook configuration (production uses Stripe Dashboard webhook endpoints)
- Webhook signature verification logic (handled in backend application code)
- Stripe CLI interactive commands beyond webhook listening (e.g., `stripe resources` commands)
- Integration with other payment providers or webhook testing tools
- Automated testing infrastructure for webhooks (unit/integration tests use mock events)
- Stripe CLI authentication via OAuth or login flows (environment variable auth only)
- Rate limiting or throttling of webhook events
- Webhook event replay or history management
