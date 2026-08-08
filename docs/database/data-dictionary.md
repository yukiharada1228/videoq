# データ辞書

完全な型、default、constraint、index は
`apps/api/src/db/schema/modern.ts` を正本とします。

## 認証

| テーブル | 用途 |
|---|---|
| `users` | アカウント、password hash、quota、暗号化済み外部 key |
| `session (Better Auth)` | opaque refresh session の hash、family、期限、revoke |
| `verification (Better Auth)` | メール確認・password reset・email change の一回限り token |
| `api_keys` | integration key の hash、prefix、access level |
| `account_deletion_requests` | アカウント削除依頼 |

`session (Better Auth).token_hash` と `verification (Better Auth).token_hash` は unique です。
平文 refresh / action token は保存しません。

## 動画・整理

| テーブル | 用途 |
|---|---|
| `videos` | file、title、source、transcript、processing status |
| `video_groups` | user の動画グループと share slug |
| `video_group_members` | group と video の関連・表示順 |
| `tags` | user 単位の tag |
| `video_tags` | video と tag の関連 |

## チャット・評価

| テーブル | 用途 |
|---|---|
| `chat_logs` | question、answer、citation、feedback |
| `chat_log_evaluations` | log 単位の評価 |
| `group_evaluation_snapshots` | group 集計 snapshot |

## Vector / PLOG

| テーブル | 用途 |
|---|---|
| `scene_embeddings` | LangChain標準列、filter可能なuser / video metadata columns、JSON metadata |
| `plog_build_jobs` | build status |
| `plog_summary_nodes` | summary hierarchy |
| `plog_concepts` | concept |
| `plog_edges` | concept relation |
| `plog_learning_objects` | concept の learning object |
| `learner_concept_states` | user ごとの学習状態 |

`scene_embeddings.embedding` の次元は設定した embedding model と一致させます。

## OAuth / OIDC

| テーブル | 用途 |
|---|---|
| `oauth_applications` | client metadata と credential |
| `oauth_grants` | authorization code / grant |
| `oauth_access_tokens` | opaque access token |
| `oauth_refresh_tokens` | refresh token と rotation |
| `oauth_id_tokens` | OIDC ID token |
| `oauth_device_grants` | device authorization |

## 共通規則

- ID は bigint identity または UUID
- 日時は `TIMESTAMPTZ`、API 出力は UTC ISO-8601
- owner / parent relation は FK
- 関連テーブルは複合 unique で重複を防止
- secret は hash または AES-256-GCM envelope で保存
