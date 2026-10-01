# Stripe Dashboard 設定（VideoQ Billing）

有料プランの購入・変更と、利用上限の反映を確認する担当者向けの手順です。
通常の画面・API開発を始めるために、Stripeを設定する必要はありません。

StripeのProductは商品、Priceは金額と課金間隔、Webhookは決済状態の変更をAPIへ通知する仕組みです。
VideoQはPriceの `lookup_key` でプランを対応付けます。金額はDashboardが基準です。

まずテスト環境で設定し、末尾の動作確認を行います。APIキー・Price・Webhookの設定が同じ環境に属することを確認してください。

## 1. API キー

Restricted API key（`rk_`）を推奨する。Checkout / Customer / Subscriptions / Prices / Webhooks を許可する。

- Worker secret: `STRIPE_SECRET_KEY`
- Worker secret: `STRIPE_WEBHOOK_SECRET`
- ローカル: [`apps/api/.dev.vars.example`](https://github.com/yukiharada1228/videoq/blob/main/apps/api/.dev.vars.example)

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

Checkout / Customer Portal に利用規約とプライバシーを出すには、Stripeで対象アカウントを選び、[Public details](https://dashboard.stripe.com/settings/public) に URL を入れる。アカウント固有のURLや連絡先は、チームのアクセス制限された運用記録で管理する。

| 項目 | URL |
|---|---|
| Terms of service | `https://videoq.jp/terms` |
| Privacy policy | `https://videoq.jp/privacy` |
| Support email | 対象環境で承認されたサポート窓口のアドレス |
| Support website | `https://videoq.jp` |

[Checkout settings](https://dashboard.stripe.com/settings/checkout) で Legal policies と Refund policy を有効にし、返金ポリシー全文は `https://videoq.jp/refund` を指す。日本の通信販売として [特商法表記](https://videoq.jp/legal) もサイトに置く。

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

Webhook受信時はStripeから取得した最新の契約状態を反映します。遅れて届いた通知や契約に関係しない請求書で、新しい契約を上書きしません。イベントの処理記録とアカウントの更新は同じトランザクションで確定し、DB更新が競合した場合は契約を再取得します。解約後も契約IDとステータスは保持し、プラン由来の利用上限をFreeに戻します。再契約のためのCheckoutは引き続き利用できます。

管理画面からのアカウント削除では、アカウントを無効化した後、配送タスクが[Stripe顧客を削除](https://docs.stripe.com/api/customers/delete)してからデータ削除を開始します。顧客削除により有効な契約を解約し、開いたままのCheckoutからの再契約も防ぎます。Stripeで失敗した場合はユーザーと顧客IDを残して再試行するため、削除完了を判断する前に失敗・dead状態の外部タスクを確認してください。Stripe顧客を持たないアカウントの削除にはStripe設定は不要です。

## 5. 決済手段

Dashboard の dynamic payment methods を使う。コードに `payment_method_types` は渡さない。

## 6. Stripe Tax

`automatic_tax` は Worker の `STRIPE_AUTOMATIC_TAX=true` のときだけ有効。

有効化する前に:

1. Tax Settings で本店住所を入れる
2. 日本の消費税登録を **Collecting** にする
3. 登録なしでフラグを立てると、エラーなしで税額 0 のままになる

税務上の登録や税コードは、このシステム設定だけでは判断できません。契約主体の状況に合わせ、担当者が確認した設定を使用してください。

## 7. 動作確認

1. Free アカウントで `/pricing` から Basic 月額へ Checkout
2. Settings でプラン表示が Basic になる
3. Portal で年額または Pro に変更し、日割り請求を確認
4. 解約後に Free 枠へ戻る
5. Admin でクォータを手編集すると `quota_source=admin` になり、以降の webhook は枠を上書きしない。`quota_source=plan` に戻すとカタログを再適用する
6. `0027_raise_ai_answers_without_evaluation` は有効なプラン管理の Basic をAI 1,800回、Proを2,800回へ更新します。Freeは30回、文字起こしは45 / 300 / 1,500分のままです。管理者の個別設定と使用量は変更しません。

## 8. 回答枠と運営予算

2026-10-02のカタログではRAGAS評価を廃止し、Basicは月1,480円・年14,800円、Proは月3,980円・年39,800円を維持します。毎月のAI回答枠は当初のBasic 500回から **1,800回**、Pro 2,500回から **2,800回**へ増枠します。年払いも同じ枠です。運営費を詳しく積み上げ直した結果、暫定案の1,700回・3,000回を更新しました。回答モデルと検索動作は変更しません。

固定費は指定された **有料50契約**で割ります。現在の実契約数が50という意味ではありません。1ドル160円、文字起こし・保存枠の全消化、消費税相当10%の売上留保、売上総額に対するStripe手数料4.3%、平均回答原価0.30円を前提とします。月払い・年払い共通の回答数は、収入が少ない年払いを基準に決めます。

### 年払い1契約あたりの月間収支

| 項目 | Basic | Pro |
| --- | ---: | ---: |
| 税相当留保・Stripe控除後の収入 | 1,068.18円 | 2,872.53円 |
| Whisper：300 / 1,500分 | 288.00円 | 1,440.00円 |
| R2：20 / 100 GiBを課金GBへ換算 | 51.54円 | 257.70円 |
| 文字起こし・索引作成のLambda | 19.34円 | 96.25円 |
| 登録時の埋め込み | 1.15円 | 5.76円 |
| Lambdaから音声API・DBへの送信 | 2.99円 | 14.93円 |
| 登録処理の再試行予算3% | 9.34円 | 46.71円 |
| 動画・会話のDB蓄積：12か月目 | 23.12円 | 47.34円 |
| ジョブのSQS操作 | 0.01円 | 0.06円 |
| 共通固定費の50契約配賦 | 98.34円 | 98.34円 |
| Free 13アカウントの全枠利用補助 | 15.73円 | 15.73円 |
| **AI回答に使える予算** | **558.70円** | **849.71円** |
| カタログの回答枠 | **1,800回** | **2,800回** |
| 1回答0.30円でのAI費用 | 540.00円 | 840.00円 |
| **残る現金収支** | **18.70円** | **9.71円** |

月払いならAI予算は772.34円・1,424.22円ですが、回答枠は共通です。追加回答のDB保存費も含めた年払いの損益分岐点は1,860回・2,831回で、100回単位に切り下げました。ProはWhisperと保存枠がBasicの5倍あるため、増収分の多くをそこに使います。前の暫定値3,000回では今回の条件で月約52円の赤字になります。

### 共通固定費と現在の無料契約

共通固定費はサービス全体で **月約4,917円**です。内訳はWorkers・Hyperdrive 800円、Neon有料化への計算資源予算3,095円、既存DB約6円、ECR 16円、監視・ログ予算640円、SQSの待機ポーリング約42円、SNS・KMS・状態保存予算16円、R2の課金丸め約2円、ドメイン・雑費予算300円です。共通費は一度だけ計上し、Hyperdriveを別料金で重ねていません。

Neonは管理画面で **Free** を確認しました。無料枠は1プロジェクトあたり月100 CU時間・DB 1GBです。Mailgunもご申告では **Free** で、公式の無料枠は **1日100通**・送信ドメイン1つです。Mailgunの管理画面にはログインが必要だったため、契約自体の独立確認はできていません。契約のアップグレードは行っていません。Cloudflareの請求額も未取得なので、Workers Paidの月5ドルを予算計上しています。

Neonの将来予算は、0.25 CU × 月730時間 × 0.106ドル、DB保存は0.35ドル/GB月です。0.25 CUが常時動くと月182.5 CU時間となり、無料の100時間を超えます。50契約が回答枠を使うと会話履歴も1GBを超えて蓄積します。Launchに切り替えた際はFreeの計算資源・保存枠を差し引けないため、現在の請求がゼロでも有料化への予算を確保しました。Mailgunは日次上限内なら0円を維持します。Basicへ移行した場合は月15ドルで、50契約では1契約のAI予算が48円減ります。

### 実測と仮定の区別

読み取り専用の調査で、ARM64・メモリ5GiB・一時領域5GiBのLambda、合計1GB未満のECRイメージ2つ、SQL上約62MBのDB、プラン管理のFree 13アカウントを確認しました。Freeは13件全員が45分・1GiB・30回答を使う場合の **月約787円**を補助予算として確保しています。現在の無料利用者数を将来の獲得数とはみなしていません。

アップロード済み動画の約486分に対する埋め込みトークンは125,120で、約257.5トークン/分でした。予算では600トークン/分を、場面分割と索引作成の2回分計上します。処理時間は文字起こし14件・索引8件の記録を取得しましたが、残存動画の長さと結びつけられませんでした。したがって **10分動画あたりLambda合計60秒は未計測の仮定**です。AWSの外向き転送には、実装の64kbps音声とDB・索引用64KiB/分を、東京の0.114ドル/GBで無料枠を差し引かず計上します。R2の配信が無料でも、Lambdaからの外向き通信は別に扱います。再試行3%、監視費、ドメイン費の予算も請求実績ではありません。

DBには毎月の回答・動画1分あたり各16KiBを12か月蓄積した時点の保存費を計上しています。履歴を12か月で自動削除する実装ではないため、運用が長くなれば増額が必要です。AI原価は全呼び出し合計で入力8,000・出力600トークン、検索用埋め込み、失敗分15%を見込んで0.30円に切り上げています。この平均トークン量は本番実測でも強制上限でもありません。

### 契約数と利用状況による差

| 有料契約数 | 1契約の固定費 | 年払いBasicのAI予算 | 年払いProのAI予算 |
| --- | ---: | ---: | ---: |
| 10 | 491.72円 | 102.39円 | 393.40円 |
| 30 | 163.91円 | 482.65円 | 773.66円 |
| **50** | **98.34円** | **558.70円** | **849.71円** |
| 100 | 49.17円 | 615.74円 | 906.75円 |

この比較ではFree総数13件・同じ基盤規模を固定しています。各規模で性能が足りることを確認した表ではありません。全枠利用のFreeが50件になるとAI予算は約514円・805円、Lambda実行時間が3倍なら約518円・650円へ下がります。計算スクリプトにはNeon 0.5 CU、Mailgun Basic、DBの24か月蓄積、1ドル170円、人件費月1万円の場合も含めています。

R2操作費を0円とできるのは、**アカウント全体**で月Class A 100万回・Class B 1,000万回以内の場合です。超過分の丸めも顧客ごとではなくアカウント全体へ適用します。保存には共有無料枠を差し引かず、共有で1GB分の丸め予算を足しています。Workers・Durable Objectsもリクエスト、CPU、実行時間、ログ、保存の有料プラン内包枠に収まることが条件です。この構成の動画配信帯域とHyperdriveには別の従量費を加えていません。AWS無料枠や他サービスの請求額には依存しません。

これは条件付きの **現金運営予算**です。人件費・外注サポート費の指定はなく0円で、広告費・返金・チャージバックも含みません。事業全体の黒字を保証するものではなく、余剰は意図的に小さくしています。長い回答、追加検索、無料利用者の増加、DB増強や有料メールへの移行前に再計算してください。

リポジトリのルートから `python3 apps/worker/scripts/estimate_plan_costs.py` で再計算できます。`--paid-contracts`、`--free-accounts`、`--usd-jpy`、`--neon-cu`、`--neon-active-hours`、`--mailgun-monthly-usd`、`--lambda-seconds-per-video-minute`、`--database-horizon-months`、`--human-operations-monthly-yen` などで前提を変更できます。カタログを直接読み、結果は `docs/verification/plan-costs-without-evaluation-2026-10-02.json`、個人情報を含まない調査根拠は `docs/verification/operating-cost-evidence-2026-10-02.json` に保存しています。

単価の出典：[Whisper](https://developers.openai.com/api/docs/models/whisper-1)、[OpenAI](https://developers.openai.com/api/docs/pricing)、[R2](https://developers.cloudflare.com/r2/pricing/)、[Workers](https://developers.cloudflare.com/workers/platform/pricing/)、[Hyperdrive](https://developers.cloudflare.com/hyperdrive/platform/pricing/)、[Neon](https://neon.com/pricing)、[Mailgun](https://www.mailgun.com/pricing/)、[AWS Lambda](https://aws.amazon.com/lambda/pricing/)、[Stripe Japan](https://stripe.com/jp/pricing)。
