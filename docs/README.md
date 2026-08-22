# VideoQ Documentation

現行 VideoQ の要件、Hono / Cloudflare Workers アーキテクチャ、modern schema、
フロントエンド、非同期 worker を説明します。

## ドキュメントマップ

### 要件

- [ユースケース図](requirements/use-case-diagram.md)
- [アクティビティ図](requirements/activity-diagram.md)
- [画面遷移図](requirements/screen-transition-diagram.md)

### アーキテクチャ

- [システム構成図](architecture/system-configuration-diagram.md)
- [Hono ネイティブ設計](architecture/hono-native-redesign.md)
- [フローチャート](architecture/flowchart.md)
- [BPMN](architecture/bpmn.md)
- [プロンプトエンジニアリング](architecture/prompt-engineering.md)

### データベース

- [ER 図](database/er-diagram.md)
- [データ辞書](database/data-dictionary.md)
- [データフロー図](database/data-flow-diagram.md)

### 詳細設計

- [コンポーネント図](design/component-diagram.md)
- [クラス図](design/class-diagram.md)
- [シーケンス図](design/sequence-diagram.md)
- [状態遷移図](design/state-diagram.md)
- [デプロイメント図](design/deployment-diagram.md)

### 課金

- [Stripe Dashboard 設定](billing/stripe-dashboard.md)

### PLOG / 検証

- [PLOG](plog/README.md)
- [pgvector 検索 PoC](architecture/poc-01-pgvector-cross-runtime-search.md)
- [quota 原子予約 PoC](architecture/poc-04-quota-upload-race.md)

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 19, TypeScript, Vite, React Router, TanStack Query |
| Web API | Hono, OpenAPIHono, Zod, Drizzle ORM, Cloudflare Workers |
| 非同期処理 | Python, AWS Lambda, Amazon SQS |
| データ | Neon PostgreSQL, pgvector, Hyperdrive |
| ストレージ | Cloudflare R2（ローカル MinIO） |
| Edge state | Durable Objects, KV |
| AI | OpenAI, Ollama, whisper.cpp |

API の実行仕様は [`apps/api/README.md`](../apps/api/README.md)、worker は
[`apps/worker/README.md`](../apps/worker/README.md) を参照してください。
