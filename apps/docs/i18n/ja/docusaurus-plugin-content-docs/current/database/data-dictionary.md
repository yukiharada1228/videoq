---
title: データ辞書
description: 目的からテーブルを探し、実際の列定義へ進むための一覧。
---

# データ辞書

調べたいデータがどのテーブルにあるかを探す一覧です。列の型・既定値・制約の完全な定義は [modern.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/db/schema/modern.ts) と [better-auth.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/db/schema/better-auth.ts)を確認してください。

## 利用者と認証

| テーブル | 保存するもの |
|---|---|
| `users` | 利用者、利用上限、課金との関連、暗号化した外部APIキー |
| `session` | Better Authのログインセッションと期限 |
| `account` | パスワード認証やGoogleなどの認証先との対応 |
| `verification` | メール確認・パスワード再設定などの検証情報 |
| `apikey` | MCP用APIキーとアクセス範囲の情報 |
| `jwks` | OAuthトークンの署名に使う鍵 |
| `account_deletion_requests` | アカウント削除依頼 |

## 動画・講座・タグ

| テーブル | 保存するもの |
|---|---|
| `videos` | 動画のタイトル・所有者・ファイル参照・文字起こし・処理状態 |
| `video_courses` | 講座、所有者、共有に関する設定 |
| `video_course_members` | 講座に含める**動画**と表示順 |
| `video_course_memberships` | 講座を利用する**人**の参加情報 |
| `video_course_invitations` | 講座への招待と状態 |
| `tags` / `video_tags` | 利用者のタグ / 動画との対応 |

## 質問・回答・評価

| テーブル | 保存するもの |
|---|---|
| `chat_logs` | 質問・回答・引用・利用者のフィードバック |
| `chat_log_evaluations` | 回答ごとの評価結果 |
| `course_evaluation_snapshots` | 講座単位の評価集計 |

## 検索

| テーブル | 保存するもの・注意点 |
|---|---|
| `scene_embeddings` | 字幕の区間と検索用の埋め込み。現行のベクトル次元は1536 |

## 配送・重複対策・課金

| テーブル | 保存するもの |
|---|---|
| `external_tasks` | 外部へ配送する仕事と配送状態 |
| `job_executions` | workerが受け取ったジョブの実行状態 |
| `mcp_idempotency_records` | MCP操作の再実行による重複を防ぐ記録 |
| `stripe_events` | 受信したStripeイベントの重複処理を防ぐ記録 |

## OAuth

| テーブル | 保存するもの |
|---|---|
| `oauth_client` | 外部クライアントの登録情報 |
| `oauth_resource` / `oauth_client_resource` | 対象APIと、クライアントに許可された対応 |
| `oauth_access_token` / `oauth_refresh_token` | 発行したトークンと更新に関する情報 |
| `oauth_consent` | 利用者がクライアントへ許可した範囲 |
| `oauth_client_assertion` | クライアント認証の再利用を防ぐ情報 |

## 共通の読み方

利用者IDはtextのUUID、動画や講座などには数値IDを使います。日時は主にタイムゾーン付きで保存し、APIではUTCのISO-8601形式で扱います。関連行の削除や重複防止は、各テーブルの外部キー・一意制約を確認します。

**関連:** [ER図](er-diagram.md)、[DBを変更する](../guides/database.md)。
