# Cloudflareトークンの更新と期限通知

有効期限の正本は [`.github/cloudflare-token-expiry.json`](../.github/cloudflare-token-expiry.json)
です。トークンの値は保存せず、名前、期限日、登録先、通知担当者だけを管理します。
2026-09-18に発行したdeploy用・resource同期用の2本は、どちらも **2026-12-17** が期限です。
失効時刻より先に切り替えるため、遅くとも前日までに更新してください。

## 自動通知

[`Cloudflare Token Expiry`](../.github/workflows/cloudflare-token-expiry.yml) が
毎日09:17 JSTに期限を確認します。mainへの監視設定変更と手動実行でも確認できます。

- 30日前: 同じ期限のトークンを1件のIssueにまとめ、`yukiharada1228`に割り当て・メンション。
- 14日前、7日前、前日、期限当日: 同じIssueで再メンション。実行が遅れた場合は該当段階に追いつきます。
- 7日前から更新まで: 監視workflowを失敗扱いにし、Actionsの失敗通知にも表示。
- 同じ段階のIssue／コメントは重複作成しません。Issueだけ閉じても再オープンします。
- 更新後の期限をmainへmergeすると、対象がなくなった旧期限のIssueを自動で閉じます。

監視jobの権限は`contents: read`と`issues: write`だけです。Cloudflare／AWS／DBのsecrets、
production environments、外部メールサービスのキーは使いません。
実際のCloudflareトークンを照会する監視ではないので、更新時の期限記録も必須です。

[GitHubの通知設定](https://github.com/settings/notifications)で次を有効にしてください。
2026-09-18時点ではどちらも有効なことを確認しています。

- Participating, @mentions and custom: On GitHub + Email
- Actions: On GitHub + Email + Failed workflows only

メール送信・配信の成否は、このworkflowからは確認できません。
[Actionsの通知設定](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)と
[scheduleの通知先](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs)を参照してください。

公開repositoryのscheduleは[60日間活動がないと自動停止](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
します。また指定時刻より遅れる場合があります。予備としてカレンダーにも期限前の通知を登録し、
トークン更新時にそちらの日付も更新してください。カレンダーはこのworkflowから自動更新しません。

## 更新手順

1. Cloudflareで新しいトークンを発行する。必要な権限は[DEPLOY.md](DEPLOY.md)を参照。
2. GitHub Environment secretsを更新する。
   - deploy用: `production-deploy.CLOUDFLARE_API_TOKEN` と `production.CLOUDFLARE_API_TOKEN`
   - resource同期用: `production.CLOUDFLARE_INFRA_TOKEN`
3. 新しいトークンでCD／resource同期が成功することを確認する。
4. 使用先を確認した旧トークンを失効させる。
5. `.github/cloudflare-token-expiry.json`の該当する`name`と`expiresOn`を実際の新トークンに合わせ、
   PRでmainへmergeする。期限日だけ先延ばしにしないこと。
6. 予備のカレンダー通知を新しい期限に合わせる。
7. `Cloudflare Token Expiry`が成功し、旧期限のIssueが閉じたことを確認する。

新しい期限がまだ30日より先なら、Issueは30日前まで作成されません。
一方だけ更新した場合、もう一方の旧期限のIssueは開いたままになります。

## 通知を送らずにテストする

Actions → Cloudflare Token Expiry → Run workflowで、`dry_run`をオンにし、
`preview_date`に`2026-11-17`（30日前）または`2026-12-10`（7日前）を指定します。
日付の指定はdry-run時だけ許可します。Issueやコメントを作成せず、結果をJob summaryへ出します。
通常の監視でGitHub APIエラーや期限設定の欠落が起きた場合もworkflowは失敗します。
