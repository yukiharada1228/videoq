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
6. `0015_raise_plan_quotas` aligns existing users with the catalog (Free: 45 minutes / 30 AI answers; Basic: 300 minutes / 500 AI answers; Pro: 1,500 minutes / 2,500 AI answers). It leaves `quota_source=admin` and `used_*` unchanged.
