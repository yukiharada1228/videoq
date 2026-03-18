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

## 🏗️ 技術スタック

| レイヤー | 技術 |
|:---|:---|
| フロントエンド | React 19, TypeScript 5, Vite 7, React Router 7, i18next, TanStack Query 5, Tailwind CSS 4, Radix UI |
| バックエンド | Django 5.2, Django REST Framework, SimpleJWT, Celery, Gunicorn + UvicornWorker (ローカル), AWS Lambda Web Adapter (本番) |
| データベース | PostgreSQL 17 + pgvector (本番は Neon Serverless PostgreSQL) |
| キャッシュ/キュー | Redis (ローカル), Amazon SQS (本番) |
| AI/ML | OpenAI API, Ollama, whisper.cpp, LangChain, Janome, NLTK |
| インフラ | **[ローカル]** Docker Compose, Nginx <br> **[本番]** AWS CDK, AWS Lambda, API Gateway, CloudFront, Cloudflare Pages, Cloudflare R2 |
