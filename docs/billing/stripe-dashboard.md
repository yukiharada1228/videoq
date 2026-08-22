# Stripe Dashboard 設定（VideoQ Billing）

コードは Price の `lookup_key` だけを見る。金額は Dashboard が正本。

## 1. API キー

Restricted API key（`rk_`）を推奨する。Checkout / Customer / Subscriptions / Prices / Webhooks を許可する。

- Worker secret: `STRIPE_SECRET_KEY`
- Worker secret: `STRIPE_WEBHOOK_SECRET`
- ローカル: [`apps/api/.dev.vars.example`](../../apps/api/.dev.vars.example)

## 2. Product と Price

**別 Product にする。** Basic と Pro を同一 Product に載せない。

| Product | Price | lookup_key | 金額（JPY） | 間隔 |
|---|---|---|---|---|
| VideoQ Basic | 月額 | `basic_monthly` | 1480 | month |
| VideoQ Basic | 年額 | `basic_yearly` | 14800 | year |
| VideoQ Pro | 月額 | `pro_monthly` | 3980 | month |
| VideoQ Pro | 年額 | `pro_yearly` | 39800 | year |

JPY はゼロ小数。`tax_behavior` は inclusive（内税）か、Tax settings の Automatic（JPY は inclusive）。

税コードは法務確認のうえ Product に付ける。候補:

- `txcd_10103001` SaaS — Business Use
- `txcd_10103000` SaaS — Personal Use

汎用 `txcd_10000000` は使わない。

## 3. Customer Portal

[Customer portal settings](https://dashboard.stripe.com/test/settings/billing/portal)

- 支払い方法の更新
- サブスクリプションの更新（Basic ⇔ Pro、月 ⇔ 年）
- Proration: `always_invoice`（日割りを作って即時請求。`create_prorations` でも可）
- 解約（期間末）

## 3.1 Public details（必須）

Checkout / Customer Portal に利用規約とプライバシーを出すには、[Public details](https://dashboard.stripe.com/acct_1Re0SMJ2c6Th1a6w/settings/public) に URL を入れる。

| 項目 | URL |
|---|---|
| Terms of service | `https://videoq.jp/terms` |
| Privacy policy | `https://videoq.jp/privacy` |
| Support email | `support@videoq.jp` |
| Support website | `https://videoq.jp` |

[Checkout settings](https://dashboard.stripe.com/acct_1Re0SMJ2c6Th1a6w/settings/checkout) で Legal policies と Refund policy を有効にし、返金ポリシー全文は `https://videoq.jp/refund` を指す。日本の通信販売として [特商法表記](https://videoq.jp/legal) もサイトに置く。

Customer Portal の privacy / terms URL も同じ値にする。

## 4. Webhook

Endpoint: `https://videoq.jp/api/billing/webhook`

購読イベント:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

ローカル: `stripe listen --forward-to localhost:8787/api/billing/webhook`

## 5. 決済手段

Dashboard の dynamic payment methods を使う。コードに `payment_method_types` は渡さない。

## 6. Stripe Tax

`automatic_tax` は Worker の `STRIPE_AUTOMATIC_TAX=true` のときだけ有効。

有効化する前に:

1. Tax Settings で本店住所を入れる
2. 日本の消費税登録を **Collecting** にする
3. 登録なしでフラグを立てると、エラーなしで税額 0 のままになる

日本の遠隔事業者は課税売上 1,000 万円超で登録義務。税理士に確認する。

## 7. 動作確認

1. Free アカウントで `/pricing` から Basic 月額へ Checkout
2. Settings でプラン表示が Basic になる
3. Portal で年額または Pro に変更し、日割り請求を確認
4. 解約後に Free 枠へ戻る
5. Admin でクォータを手編集すると `quota_source=admin` になり、以降の webhook は枠を上書きしない。`quota_source=plan` に戻すとカタログを再適用する
6. 既存 Free ユーザーの枠は `0014_apply_free_plan_quotas` でカタログ（1GB / 10分 / AI 15 / 200MB）に揃える。`used_*` は消さない
