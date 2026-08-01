# VideoQ Documentation

## Overview

VideoQの設計ドキュメントです。現行実装をベースに、要件定義からアーキテクチャ設計、データベース設計、詳細設計までをまとめています。

## 📖 ドキュメントマップ

以下の順に読むと、全体像から詳細へとスムーズに理解できます。

### 1. 要件定義（Requirements）

プロダクトの機能要件とユーザー体験の定義です。

| ドキュメント | 説明 |
|:---|:---|
| [ユースケース図](requirements/use-case-diagram.md) | ユーザー・管理者・ゲスト・APIクライアントの操作一覧 |
| [アクティビティ図](requirements/activity-diagram.md) | 主要な業務フローの流れ |
| [画面遷移図](requirements/screen-transition-diagram.md) | フロントエンドの画面遷移とルーティング |

### 2. アーキテクチャ設計（Architecture）

システム全体の構成と処理フローの設計です。

| ドキュメント | 説明 |
|:---|:---|
| [システム構成図](architecture/system-configuration-diagram.md) | 全体アーキテクチャ、レイヤー構成、セキュリティ |
| [フローチャート](architecture/flowchart.md) | 主要処理フロー（アップロード、チャット、認証 等） |
| [BPMN](architecture/bpmn.md) | ビジネスプロセスモデル（登録、文字起こし、共有 等） |
| [プロンプトエンジニアリング](architecture/prompt-engineering.md) | RAGプロンプトの設計とカスタマイズ方法 |

### 3. データベース設計（Database）

データモデルとデータフローの定義です。

| ドキュメント | 説明 |
|:---|:---|
| [ER図](database/er-diagram.md) | エンティティ関連図とリレーション詳細 |
| [データ辞書](database/data-dictionary.md) | テーブル・カラム定義、制約、インデックス |
| [データフロー図](database/data-flow-diagram.md) | 機能ごとのデータの流れ |

### 4. 詳細設計（Design）

コンポーネント構成とインタラクション設計です。

| ドキュメント | 説明 |
|:---|:---|
| [コンポーネント図](design/component-diagram.md) | フロントエンド・バックエンドのコンポーネント構成 |
| [クラス図](design/class-diagram.md) | モデル、ドメイン抽象、ユースケース、ビュー |
| [シーケンス図](design/sequence-diagram.md) | 主要機能の処理シーケンス |
| [状態遷移図](design/state-diagram.md) | 動画・ユーザー・共有・APIキー等の状態遷移 |
| [デプロイメント図](design/deployment-diagram.md) | Docker Compose構成、ネットワーク、ボリューム |

### 5. 学習モード（PLOG）

| ドキュメント | 説明 |
|:---|:---|
| [PLOG](plog/README.md) | 前提関係グラフ・学習モード・構築パイプライン |

### 6. Cloudflare 移行（Migration）

Web バックエンドを Cloudflare Workers / Hono へ移行するための検討・要件です。

| ドキュメント | 説明 |
|:---|:---|
| [Cloudflare 全面移行 技術実現可能性レポート](architecture/cloudflare-hono-migration-study.md) | 7ドメイン横断のフィジビリティ検証（データ層・重量計算・OAuth 等）と段階移行戦略 |
| [Cloudflare Workers / Hono 移行 要件定義書](architecture/cloudflare-hono-migration-requirements.md) | 現行コードに整合した移行スコープ・機能/非機能要件・フェーズ・受け入れ基準 |
| [codex 独立レビュー記録](architecture/cloudflare-hono-migration-requirements-review-codex.md) | 要件定義書を実コードで一次照合した第三者レビュー（file:line 引用付き, v1.2 是正の根拠） |
| [PoC #01: pgvector クロスランタイム検索検証](architecture/poc-01-pgvector-cross-runtime-search.md) | データ層 PoC。直接 SQL 検索を psql→実 Workers→本番 Hyperdrive+Neon まで実測（全合格） |
| [PoC #02: 非同期ジョブ投入（Worker→SQS→Lambda）](architecture/poc-02-sqs-dispatch.md) | Worker の最小 JSON を既存 Lambda が受理・ディスパッチ。ローカル＋実 AWS SQS で全経路実測（方式 B ゼロ改修） |
| [PoC #03: 認証カットオーバー互換](architecture/poc-03-auth-cutover.md) | Worker(jose/WebCrypto)が Django 発行の JWT/API キーを同一検証。無停止カットオーバー可能を実測 |
| [PoC #04: quota・アップロード競合](architecture/poc-04-quota-upload-race.md) | 原子的な条件付き UPDATE 予約を Worker 生 SQL で再現。20/30 並行でも超過予約ゼロを実測 |
| [JR-2/JR-4 冪等性・失敗処理 設計書](architecture/jr2-idempotency-design.md) | 非同期ジョブの冪等性設計（fencing 付き claim 台帳＋副作用の原子性境界別対応）。[codex レビュー記録](architecture/jr2-idempotency-design-review-codex.md)で是正 |
| （実装）[`backend-hono/`](../backend-hono/) | Phase 0 実装。Hono on Workers 基盤（ミドルウェア / health・ready / Hyperdrive・R2 / 既存 API プロキシ）。`npm create hono@latest` 生成 |

## 🏗️ 技術スタック

| レイヤー | 技術 |
|:---|:---|
| フロントエンド | React 19, TypeScript 5, Vite 7, React Router 7, i18next, TanStack Query 5, Tailwind CSS 4, Radix UI |
| バックエンド | Django 5.2, Django REST Framework, SimpleJWT, Celery, Gunicorn + UvicornWorker (ローカル), AWS Lambda Web Adapter (本番) |
| データベース | PostgreSQL 17 + pgvector (本番は Neon Serverless PostgreSQL) |
| キャッシュ/キュー | Redis (ローカル), Amazon SQS (本番) |
| AI/ML | OpenAI API, Ollama, whisper.cpp, LangChain, Janome, NLTK |
| 利用枠管理 | `User` の上限値・使用量を `quota` ドメインで検証（管理者がユーザー単位で設定） |
| インフラ | **[ローカル]** Docker Compose, Caddy, Nginx <br> **[本番]** Terraform, AWS Lambda, API Gateway, CloudFront, Cloudflare Pages, Cloudflare R2 |
