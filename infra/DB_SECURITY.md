# 本番DBの権限と認証情報

Neon project `videoq` (`frosty-feather-64812505`) の `production`
(`br-plain-fog-a1tapmzu`) を対象とします。2026-09-18の確認時点で、このprojectのbranchは
productionの1件です。

## 用途別の接続

| 用途 | PostgreSQL role | 保存先 |
|---|---|---|
| Workers API / Lambda | `videoq_app_20260918` | Hyperdrive `videoq-neon-prod` / SSM `/videoq/prod/db` |
| DB migration | `videoq_migrate_20260918` | GitHub `production-app.DATABASE_URL` / 復旧用SSM `/videoq/security/prod/db-migration` |
| 管理・障害復旧 | `neondb_owner` | SSM `/videoq/security/prod/db-admin` |

SSMの値はいずれも`SecureString`のJSONで、キーは`DATABASE_URL`です。migrationと管理用は
Neonのdirect endpoint、アプリ用は既存のpooler endpointを使用します。TLSを必須とします。
管理・migration用SSMは通常の`/videoq/prod/*`からも分離し、アプリに付与しません。
これらの復旧用SSM parameterは手動管理です。Terraformへ取り込む場合は先にimportし、
値の`ignore_changes`と削除保護を設定してください。

Lambda実行role `videoq-worker-prod` のSSM読み取り許可は`/videoq/prod/db`と
`/videoq/prod/app`の2件だけです。管理用の接続情報をこれらに保存しないでください。
GitHubのRepository secretsには`DATABASE_URL`を保存しません。

## DB権限

- アプリroleは`public`の既存テーブルへの`SELECT / INSERT / UPDATE / DELETE`と、
  sequenceの`USAGE / SELECT`を持ちます。テーブル所有者ではなく、`public`へのCREATE、
  databaseへのCREATE、TRUNCATE、`drizzle` schemaへのUSAGEは付与しません。
- migration roleは`public`と`drizzle`のアプリテーブル・sequenceの所有者です。
  schemaの作成・変更に必要な権限を持ちます。既存の`vector` extensionとdatabase自体は
  管理roleが所有します。新しいextensionの導入は管理作業として扱います。
- 両roleとも`NOSUPERUSER / NOCREATEDB / NOCREATEROLE / NOREPLICATION /
  NOBYPASSRLS`です。`neon_superuser`や管理roleへのmembershipは付与しません。
- migration roleの`ALTER DEFAULT PRIVILEGES`で、今後`public`に作るテーブル・sequenceにも
  アプリ用のデータ操作権限を付けます。別のroleでmigrationを実行するとこの設定は適用されません。
- `neondb_owner`は管理専用です。アプリ用・migration用roleを管理するmembershipを持ちますが、
  逆方向のmembershipはありません。

Neon Console / APIで通常のroleを作ると`neon_superuser`が付くため、制限されたroleは
[SQLで作成](https://neon.com/docs/manage/roles#manage-roles-with-sql)します。
DB roleの分離はアプリのユーザー別アクセス制御の代わりにはなりません。

## ローテーションの順序

1. 対象project・branch・database・利用先を確認し、重なるdeployを避ける。
   Neonのrole/passwordはbranch単位なので、複製branchがある場合は個別に確認する。
2. 十分な乱数から新しいパスワードを生成し、新しい用途別roleをSQLで作る。
   値をコマンド引数、ログ、チャット、Gitへ出さない。
3. 新migration roleへアプリのobject所有権を引き継ぐ。新roleのdefault privilegesも設定し、
   アプリのDML成功・DDL拒否・新テーブルへの自動grantをトランザクション内で確認する。
4. migrationの復旧用SSMとGitHub Environment secretを更新し、現行mainの
   `npm run db:migrate --workspace @videoq/api`が成功することを確認する。
5. Hyperdriveのorigin user/passwordとアプリ用SSMを更新する。Hyperdriveのquery cachingは
   無効のままにする。設定変更だけでは既存connection poolが残る場合があるため、
   [接続の切り替わりも確認](https://developers.cloudflare.com/hyperdrive/configuration/rotate-credentials/)する。
6. LambdaはSSMをwarm containerごとに一度しか読まないため、同じimage digestの再適用などで
   実行環境を更新する。SSMを書き換えるだけで完了にしない。
7. APIの`/health`・`/ready`、LambdaからのDB読み書き、migrationを確認する。
   旧接続情報はここまで維持し、必要なら切り戻す。
8. 管理roleの旧パスワードを更新する、または旧用途別roleをNOLOGINにして認証を無効化する。
   所有objectを残したままroleを削除しない。旧roleの残存sessionも確認し、実行中の処理を
   終えてから閉じる。旧パスワードでdirect / pooler両方の新規接続が拒否されることを確認する。
9. 旧認証の無効化後にAPI・Lambdaを再確認し、テスト用レコードを削除する。

Neonの管理ユーザーだけを先にresetすると、更新していない利用先が接続できなくなります。
漏えいが疑われる場合は、作業の緊急度と接続停止の影響を合わせて判断してください。
