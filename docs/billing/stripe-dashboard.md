# Stripe Dashboard setup (VideoQ Billing)

This guide is for those verifying paid-plan purchases, changes, and usage limits.
Stripe setup is not required to begin ordinary frontend or API development.

A Stripe Product represents a product, a Price defines its amount and billing interval,
and a webhook notifies the API of payment state changes. VideoQ maps plans through
Price `lookup_key` values. The Dashboard is the source of truth for amounts.

Configure the test environment first, then follow the verification steps below.
Ensure API keys, Prices, and webhooks all belong to the same environment.

## 1. API keys

Use a restricted API key (`rk_`) where possible. Allow Checkout / Customer / Subscriptions / Prices / Webhooks.

- Worker secret: `STRIPE_SECRET_KEY`
- Worker secret: `STRIPE_WEBHOOK_SECRET`
- Local configuration: [`apps/api/.dev.vars.example`](https://github.com/yukiharada1228/videoq/blob/main/apps/api/.dev.vars.example)

## 2. Products and Prices

**Use separate Products.** Do not put Basic and Pro under the same Product.

| Product | Price | lookup_key | Amount (JPY) | Interval |
|---|---|---|---|---|
| VideoQ Basic | Monthly | `basic_monthly` | 1480 | month |
| VideoQ Basic | Yearly | `basic_yearly` | 14800 | year |
| VideoQ Pro | Monthly | `pro_monthly` | 3980 | month |
| VideoQ Pro | Yearly | `pro_yearly` | 39800 | year |

JPY is a zero-decimal currency. Set `tax_behavior` to inclusive, or use Automatic in Tax settings (inclusive for JPY).

Assign a tax code to each Product after legal review. Candidates:

- `txcd_10103001` SaaS — Business Use
- `txcd_10103000` SaaS — Personal Use

Do not use the generic `txcd_10000000`.

## 3. Customer Portal

[Customer portal settings](https://dashboard.stripe.com/test/settings/billing/portal)

- Payment method updates
- Subscription updates (Basic ⇔ Pro, monthly ⇔ yearly)
- Proration: `always_invoice` (create prorations and invoice immediately; `create_prorations` is also an option)
- Cancellation at the end of the period

## 3.1 Public details (required)

To show terms and privacy policies in Checkout / Customer Portal, select the appropriate account in Stripe and enter URLs in [Public details](https://dashboard.stripe.com/settings/public). Keep account-specific URLs and contact details in the team's access-controlled operations records.

| Field | URL |
|---|---|
| Terms of service | `https://videoq.jp/terms` |
| Privacy policy | `https://videoq.jp/privacy` |
| Support email | The approved support address for the selected environment |
| Support website | `https://videoq.jp` |

Enable Legal policies and Refund policy in [Checkout settings](https://dashboard.stripe.com/settings/checkout), linking the full refund policy to `https://videoq.jp/refund`. Also publish the [disclosure under Japan's Specified Commercial Transactions Act](https://videoq.jp/legal) for Japanese mail-order sales.

Use the same privacy and terms URLs in Customer Portal.

## 4. Webhook

Endpoint: `https://videoq.jp/api/billing/webhook`

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Local forwarding: `stripe listen --forward-to localhost:8787/api/billing/webhook`

Webhooks reconcile the latest subscription retrieved from Stripe. Delayed events
and standalone invoices must not overwrite a newer subscription. The API commits
each event receipt together with its account update; database conflicts retry the
lookup before committing. Canceled subscription IDs and statuses remain recorded,
while plan-based quotas return to Free. A new checkout is still allowed.

Admin account deletion first disables the account, then the durable delivery task
[deletes its Stripe customer](https://docs.stripe.com/api/customers/delete) before
dispatching data deletion. Customer deletion cancels active subscriptions and
prevents new subscriptions through an already-open checkout. Stripe failures keep
the user record and customer ID available for retry; inspect failed/dead external
tasks before treating account deletion as complete. Accounts without a Stripe
customer do not require Stripe configuration for deletion.

## 5. Payment methods

Use the Dashboard's dynamic payment methods. Do not pass `payment_method_types` in code.

## 6. Stripe Tax

`automatic_tax` is enabled only when the Worker's `STRIPE_AUTOMATIC_TAX=true`.

Before enabling it:

1. Enter the business address in Tax Settings.
2. Set the Japanese consumption tax registration to **Collecting**.
3. Enabling the flag without a registration can leave tax at 0 without an error.

Tax registration and tax-code choices cannot be determined from this system configuration alone. Use settings verified by the responsible person for the contracting entity's circumstances.

## 7. Verify behavior

1. From a Free account, check out for Basic monthly via `/pricing`.
2. Confirm that Settings shows the Basic plan.
3. Switch to yearly billing or Pro in the Portal and verify proration.
4. Confirm that quotas return to Free after cancellation takes effect.
5. Manually editing quotas in Admin sets `quota_source=admin`; subsequent webhooks do not overwrite those limits. Setting it back to `quota_source=plan` reapplies the catalog.
6. `0027_raise_ai_answers_without_evaluation` raises usable plan-managed subscriptions to Basic 1,800 / Pro 2,800 answers. Free remains at 30; transcription remains 45 / 300 / 1,500 minutes. Admin overrides and used counters are preserved.

## 8. Answer allowance and operating budget

The 2026-10-02 catalog removes RAGAS scoring and keeps prices unchanged: Basic ¥1,480/month or ¥14,800/year; Pro ¥3,980/month or ¥39,800/year. Monthly answer allowances rise from the original 500 to **1,800** and from 2,500 to **2,800**, including annual subscriptions. The generation model and retrieval behavior are unchanged. These replace the provisional 1,700/3,000 estimates after a more detailed operating-cost audit.

The allocation base is **50 paid contracts**, not a measured current customer count. The budget assumes ¥160/USD, full transcription and storage quotas, a 10% tax-equivalent revenue reserve, Stripe Payments + Billing fees of 4.3% on gross receipts, and an average AI answer cost of ¥0.30. The common answer quota is determined by the lower revenue of annual subscriptions.

### Monthly cost per annual subscription

| Item | Basic | Pro |
| --- | ---: | ---: |
| Revenue after tax reserve and Stripe | ¥1,068.18 | ¥2,872.53 |
| Whisper: 300 / 1,500 minutes | ¥288.00 | ¥1,440.00 |
| R2: 20 / 100 GiB, converted to billing GB | ¥51.54 | ¥257.70 |
| Transcription and indexing Lambda | ¥19.25 | ¥96.25 |
| Ingestion embeddings | ¥1.15 | ¥5.76 |
| Lambda outbound audio and DB transfer | ¥2.99 | ¥14.93 |
| Ingestion retry allowance, 3% | ¥9.34 | ¥46.71 |
| DB growth, video + chat at month 12 | ¥23.12 | ¥47.34 |
| SQS job operations | ¥0.01 | ¥0.06 |
| Shared fixed expenses, divided by 50 | ¥98.34 | ¥98.34 |
| Subsidy for 13 Free accounts at full quota | ¥15.73 | ¥15.73 |
| **Available AI answer budget** | **¥558.70** | **¥849.71** |
| Catalog answer allowance | **1,800** | **2,800** |
| AI expense at ¥0.30/answer | ¥540.00 | ¥840.00 |
| **Remaining cash margin** | **¥18.70** | **¥9.71** |

Monthly subscribers have ¥772.34 / ¥1,424.22 available for answers, but receive the same quota. The calculated annual-plan ceilings, including the extra database cost of each answer, are 1,860 / 2,831 answers. Pro's Whisper and storage quotas cost five times as much as Basic's; this consumes much of its higher revenue. The earlier provisional Pro quota of 3,000 would lose about ¥52/month in this case.

### Shared expenses and current Free subscriptions

Shared expenses total approximately **¥4,917/month**: Workers including Hyperdrive ¥800; a Neon Launch compute reserve ¥3,095; current database footprint ¥6; ECR ¥16; monitoring/logging reserve ¥640; idle SQS polling ¥42; SNS/KMS/state reserve ¥16; account-level R2 rounding ¥2; and domain/miscellaneous reserve ¥300. Fixed costs are counted once for the service. No separate Hyperdrive charge is added.

Neon is currently **Free**, verified in the account Billing UI: 100 CU-hours and 1 GB storage per project. Mailgun is currently **Free** according to the account owner; its official allowance is 100 emails **per day**, with one sending domain. Its account UI required login, so the contract was not independently verified. No subscription was upgraded. Cloudflare's current invoice was not accessible; $5/month is budgeted for Workers Paid.

Neon's future reserve uses 0.25 CU × 730 hours × $0.106, plus database storage at $0.35/GB-month. A continuously active 0.25 CU consumes 182.5 CU-hours, above Free's 100; 50 fully used answer quotas also grow chat storage beyond 1 GB. Paid Launch does not inherit Free compute/storage credits. The reserve is therefore retained even while today's bill is zero. Mailgun remains budgeted at zero while daily email traffic fits its Free limit; upgrading to Basic would reduce each paid account's answer budget by ¥48/month at 50 contracts.

### Evidence and assumptions

The read-only audit confirmed an ARM64 Lambda with 5 GiB memory and 5 GiB temporary storage, two ECR images totaling less than 1 GB before layer deduplication, about 62 MB of SQL database storage, and 13 plan-managed Free accounts. All 13 Free accounts are reserved at their full 45-minute/1-GiB/30-answer quota: approximately ¥787/month in total. The current Free population is not a forecast of future acquisition.

The uploaded corpus contains 125,120 embedding tokens across approximately 486 minutes. The model reserves 600 tokens/minute and two embedding passes. Job records provide 14 transcription and eight indexing timings, but none could be joined to a surviving video duration. Consequently, **60 total billed Lambda seconds per 10-minute upload is an assumption**, not a measured processing rate. AWS outbound transfer reserves the configured 64-kbps audio plus 64 KiB/minute for DB/index traffic at Tokyo’s $0.114/GB list rate, without its shared free allowance. R2’s free egress does not make Lambda’s outbound requests free. A 3% ingestion retry allowance and the monitoring/domain reserves are also assumptions.

Database growth is budgeted at the end of month 12 using 16 KiB per monthly answer and video-minute. This does not impose a retention policy; older histories continue accumulating. AI cost still assumes 8,000 input and 600 output tokens summed across all model calls, query embeddings and a 15% failure allowance, rounded up to ¥0.30. The short-answer fixture is not a production average.

### Sensitivity and operating limits

| Paid contracts | Fixed expense per contract | Annual Basic AI budget | Annual Pro AI budget |
| --- | ---: | ---: | ---: |
| 10 | ¥491.72 | ¥102.39 | ¥393.40 |
| 30 | ¥163.91 | ¥482.65 | ¥773.66 |
| **50** | **¥98.34** | **¥558.70** | **¥849.71** |
| 100 | ¥49.17 | ¥615.74 | ¥906.75 |

This table holds total Free accounts at 13 and the same infrastructure capacity. It is an allocation comparison, not proof that capacity remains sufficient at every scale. At 50 full-quota Free accounts, annual AI budgets drop to approximately ¥514 / ¥805. A threefold Lambda runtime drops them to ¥518 / ¥650. The script also models 0.5-CU Neon, Mailgun Basic, 24-month DB growth, FX ¥170/USD, and ¥10,000/month of human operating expense.

R2 operations are zero only while the **whole account** stays below 1 million Class A and 10 million Class B operations/month; excess is rounded at account level, not per customer. Storage is modeled without its shared free credit, with one shared GB rounding allowance. Workers and Durable Objects must likewise stay within their paid-plan included requests, CPU, duration, logs and storage. Video egress and Hyperdrive have no separate charge in this configuration. AWS free credits and unrelated AWS account expenses are not used to fund the quota.

This is a conditional **cash operating budget**, not guaranteed company profit. Human labor is zero because no salary/support budget was supplied; advertising, refunds and chargebacks are excluded. The margin is deliberately small. Longer answers, repeated searches, growing Free usage, more DB capacity or paid email can erase it. Recalculate before these conditions change.

Run `python3 apps/worker/scripts/estimate_plan_costs.py` from the repository root. Useful overrides include `--paid-contracts`, `--free-accounts`, `--usd-jpy`, `--neon-cu`, `--neon-active-hours`, `--mailgun-monthly-usd`, `--lambda-seconds-per-video-minute`, `--database-horizon-months`, and `--human-operations-monthly-yen`. The script reads the live catalog. Results and sanitized evidence are stored in `docs/verification/plan-costs-without-evaluation-2026-10-02.json` and `docs/verification/operating-cost-evidence-2026-10-02.json`.

Provider references: [Whisper](https://developers.openai.com/api/docs/models/whisper-1), [OpenAI](https://developers.openai.com/api/docs/pricing), [R2](https://developers.cloudflare.com/r2/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [Hyperdrive](https://developers.cloudflare.com/hyperdrive/platform/pricing/), [Neon](https://neon.com/pricing), [Mailgun](https://www.mailgun.com/pricing/), [AWS Lambda](https://aws.amazon.com/lambda/pricing/), [Stripe Japan](https://stripe.com/jp/pricing).
