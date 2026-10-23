# On-prem application edition — 2026-10-23

Scope: remove SaaS billing/marketing pages and unnecessary external integrations
from the on-prem application while retaining the cloud edition. The user chose
administrator-managed accounts and default-disabled external integrations.
This change is based on the local-inference implementation in PR #1143.

## Delivered behavior

- `DEPLOYMENT_EDITION=onprem` selects server policy in the Node API and Helm
  ConfigMap. The on-prem web Docker build defaults to
  `VITE_DEPLOYMENT_EDITION=onprem`. Invalid edition values fail configuration.
- On-prem artifacts exclude LP/pricing/commercial legal/refund/public signup,
  email verification and forgot-password pages, public demo assets, sitemap and
  remote Google Fonts. Missing routes redirect to the local login/dashboard.
  The initial HTML is local-only and noindex; runtime metadata keeps that policy.
- Billing, upgrade controls, Google login, YouTube/SearchAPI and Mailgun are
  disabled. Billing webhooks and tRPC operations reject access even with stale
  provider keys. Account deletion does not call Stripe in this edition.
  YouTube playback/thumbnail requests and queued YouTube transcription are blocked.
- Administrators bootstrap through `node dist/provision-user.mjs --admin`, then
  create ordinary users and issue recovery links through the admin UI. Native
  Better Auth setup/reset links expire in 15 minutes and are single-use. No
  temporary password is returned and no mail service is involved. A signed-in
  on-prem login page resumes navigation after AuthProvider replaces its cache.
- Course owners issue private invitation links. Reissuing invalidates the old
  link; the existing seven-day expiry and recipient-account check remain.
  On-prem course invitations create no email delivery outbox tasks.
- New on-prem accounts default to unlimited storage/monthly upload/processing/AI
  quotas managed by administrators. Explicit operational defaults can be set.
  Existing user limits, per-file ceilings and rate limits remain in force.
- Cloud builds keep existing pages, email verification, signup, billing and
  integration behavior. Shared schemas retain billing columns and Stripe as a
  cloud dependency; the on-prem policy excludes its exposed functionality.

## Actual acceptance

A dedicated disposable PostgreSQL/pgvector instance was used; existing databases,
Docker/Kubernetes workloads and the original dirty workspace were not modified.
The database-backed integration test covers:

- Operator bootstrap, private setup, ordinary-user creation through an authenticated
  admin, login, forbidden ordinary-user admin access, reset-token replay and expiry.
- No SaaS free-tier caps on the created user; role is ordinary user and quota
  source is admin. Stale Stripe/Google/Mailgun keys do not enable their APIs.
- Course invitation/reissue/acceptance with no email outbox tasks, rejection of the
  old link, and zero outbound HTTP calls across the tested account/course flow.

A production on-prem web build ran in Chromium over a temporary HTTPS loopback
proxy to the real Node API and disposable DB. Eight excluded/public entry URLs
resolved to login. The browser completed administrator login, account creation,
new-user setup and ordinary-user login. Settings had no billing or SearchAPI
sections, ordinary users had no admin navigation, and no external page requests
or JavaScript page errors occurred. Browser rate-limit fixtures were reset only
in this disposable database between acceptance runs; production throttles were
retained. Screenshots were inspected for login, settings and account provisioning.
The account administration page also fit a 390px mobile viewport without
horizontal overflow.

Local evidence and screenshots live at `/tmp/videoq-onprem-edition-validation`.
The web artifact verifier checks actual emitted files, not source flags: excluded
page chunks, demo files, public sitemap/llms files and external-font HTML are absent.
The production web Docker build runs this verifier automatically.

## Automated validation

- API unit suite: 1133 passed, 601 independently gated tests skipped.
- PostgreSQL-enabled API suite: 1681 passed, 53 independently gated tests skipped.
  The account/course acceptance creates and migrates an isolated database so it
  also runs with the other API suites, which use intentionally partial schemas.
- Web unit suite: 1298 passed, including login-remount, link copy/dismiss,
  course-invitation reissue and private metadata regressions. Web lint and
  typecheck passed. Whole-web line coverage: 93.91%; all 49 changed instrumented
  statement lines were covered locally.
- Worker transcription tests: 16 passed, including rejecting YouTube before the
  external provider. Workflow policy tests: 168 passed.
- English/Japanese documentation production builds and public-content checks passed.
  On-prem release/registry policy tests: 10 passed; shared tRPC typecheck passed.
- On-prem CI exercises operator bootstrap rather than public signup, verifies the
  worker image's edition, and includes the database-backed edition test.

## Deployment boundaries

Web and API editions must match. Existing released images need rebuilding after
merge; the prior release does not acquire these changes from Helm alone. This is
an application edition, not a migration deleting billing tables or old user limits.
Core video/course management, local AI adapters, search/chat, API keys/MCP and
intranet sharing remain. AI endpoints still require the chosen local-inference
configuration; this edition does not rewrite an operator-selected model endpoint.
No production deployment or automatic merge is part of this acceptance.
