# VideoQ Documentation

## Overview

VideoQの設計ドキュメントです。要件定義からアーキテクチャ設計、データベース設計、詳細設計まで、開発に必要な情報を体系的にまとめています。

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
| フロントエンド | React, TypeScript, Vite, TanStack Query, shadcn/ui |
| バックエンド | Django, Django REST Framework, Celery |
| データベース | PostgreSQL 17 + pgvector |
| キャッシュ/キュー | Redis |
| AI/ML | OpenAI API (GPT, Whisper, Embeddings) / Ollama (ローカル) |
| インフラ | Docker Compose, Nginx |
