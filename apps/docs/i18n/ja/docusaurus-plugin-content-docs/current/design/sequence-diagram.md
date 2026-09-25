---
title: 主要な通信の順序
description: アップロード・ログイン・質問で、どの相手とどの順番で通信するか。
---

# 主要な通信の順序

図は上から下へ時間が進みます。縦線は処理の担当、矢印は呼び出しや応答です。ネットワークログやAPIのコードを追うときに使います。

## ファイルのアップロード

```mermaid
sequenceDiagram
    participant User as ブラウザ
    participant API as Hono API
    participant DB as PostgreSQL
    participant Store as R2 / MinIO
    participant Queue as SQS / ElasticMQ
    participant Worker as Python worker
    User->>API: videos.requestUpload
    API->>DB: 容量を予約・動画を作成
    API-->>User: 署名付きアップロードURL
    User->>Store: ファイル本体を送信
    User->>API: videos.confirmUpload
    API->>Store: 送信したファイルを確認
    API->>DB: 状態更新・配送予定を保存
    API->>Queue: ジョブを送信
    API-->>User: 登録結果
    Queue->>Worker: 文字起こしジョブ
    Worker->>DB: 文字起こし・処理結果を保存
```

APIが返す登録結果と、動画の処理完了は別です。後続の索引作成は[状態遷移](state-diagram.md)を参照してください。

## ブラウザのログイン

```mermaid
sequenceDiagram
    participant User as ブラウザ
    participant Auth as Better Auth
    participant DB as PostgreSQL
    User->>Auth: ログイン情報を送る
    Auth->>DB: アカウントを検証
    Auth->>DB: セッションを保存
    Auth-->>User: セッションCookie
    User->>Auth: Cookieを付けてセッションを確認
    Auth-->>User: ログイン状態
```

Better AuthはAPIの `/api/auth/*` で動きます。MCP向けOAuthトークンの発行・更新とは別の経路です。

## 講座への質問

```mermaid
sequenceDiagram
    participant User as ブラウザ
    participant API as チャット処理
    participant DB as PostgreSQL
    participant AI as AIサービス
    User->>API: 質問と講座を送る
    API->>DB: 講座へのアクセスを確認
    API->>AI: 質問に応じた情報取得を判断
    AI-->>API: 登録情報・シーン検索を要求
    API->>DB: 許可された範囲の情報を取得
    API->>AI: 情報を渡して回答を生成
    API-->>User: 回答を順次送信
    API->>DB: 質問・回答・引用などを保存
```

情報取得は必要に応じて繰り返されます。図はQ&Aの概略で、登録情報だけで回答する経路や非ストリーミングの応答もあります。

**関連:** [認証とアクセス権](../concepts/auth.md)、[プロンプト設計](../architecture/prompt-engineering.md)。
