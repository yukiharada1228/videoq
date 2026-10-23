---
sidebar_label: オンプレ Kubernetes
description: 既存の Kubernetes または K3s に Helm で VideoQ を導入する。
---

# VideoQ をオンプレで動かす

VideoQ の Web・Node.js API・Python ワーカーを、既存の Kubernetes に配置できます。
小規模な導入では、単一ノードの K3s から始められます。配布にはリポジトリの
[Helm Chart](https://github.com/yukiharada1228/videoq/tree/main/charts/videoq)
を使います。Chart の README に、必要な外部基盤、イメージの作成、設定例、導入・更新・切り戻しの手順をまとめています。

## 配置する構成

```mermaid
flowchart TB
    Browser[ブラウザー] --> Gateway[導入先の入口・TLS]
    Gateway --> Web[静的 Web]
    Gateway --> API[Hono API / Node.js]
    API --> DB[(PostgreSQL + pgvector)]
    API --> Queue[永続化した SQS 互換キュー]
    API --> Storage[S3 互換ストレージ]
    Browser --> Storage
    Queue --> Worker[Python ワーカー]
    Worker --> DB
    Worker --> Storage
    API --> Inference[設定した推論サービス]
    Worker --> Inference
    Recovery[回復・保持期間の CronJob] --> DB
    Recovery --> Queue
```

Chart はアプリの配置と更新を担当します。DB・動画保存・キュー・推論サーバー・クラスタ・DNS・証明書は導入先で用意し、接続先を設定します。既存の社内基盤も利用できます。GPU 推論は別のワークロードまたは別マシンに置き、API と動画ワーカーから呼び出します。

## クラウド構成との違い

| 機能 | クラウド | オンプレ |
|---|---|---|
| HTTP・チャット | Workers / ChatExecution DO | 同じ HTTP 処理を通る Hono の Node.js サーバー |
| DB 接続 | Hyperdrive | PostgreSQL への直接接続とプロセス単位のプール |
| 共有レート制限 | RateLimiter DO | PostgreSQL の行ロックで直列化 |
| 未配送・放棄アップロードの回復 | TaskScheduler DO のアラーム | DB に残った対象を毎分拾う CronJob |
| 保持期間の掃除 | Workers の日次 cron | UTC で動く日次 CronJob |
| 動画操作 | R2 バインディング・署名 URL | S3 API・署名 URL |
| 動画ジョブ | Lambda の SQS トリガー | 常駐 Python ワーカーによるロングポーリング |

Node.js の起動処理は Durable Objects を読み込まず、本番用の認証設定を使います。起動時に必要な鍵・接続先も検証します。SSE と tRPC のチャットは、既存の認証・権限・利用枠確認を通ります。

## 初回導入の手順

1. PostgreSQL 17 と pgvector、非公開の S3 バケット、永続化した SQS 互換キューとデッドレターキューを用意します。バケットの CORS と、ブラウザーから公開 S3 エンドポイントへの到達も設定します。
2. Chart の README に沿って API・Web・オンプレワーカーのイメージを作成し、クラスタから取得できるレジストリへ置きます。
3. Namespace と、導入先が管理する Secret を事前に作成します。API とワーカーの暗号鍵は共通にします。
4. `charts/videoq/examples/site.yaml` をリポジトリ外にコピーし、例示のホスト名・接続先・イメージ名・証明書を置き換えます。Helm の lint と template で確認します。
5. Chart をインストールします。先にマイグレーション Job が成功してから、アプリが配置されます。
6. `/ready` の成功、利用者登録、管理者への昇格を確認し、短い動画の文字起こし・Q&A・引用時刻の再生まで試します。

`registry.example.edu` のイメージは、導入先で作成するイメージの例です。このリポジトリがそのアドレスで配布しているわけではありません。閉域環境ではイメージとパッケージ化した Chart を先に搬入し、チャット・埋め込み・文字起こしの全接続先をローカルサービスに設定します。メール・YouTube・Google ログイン・課金を使う場合は、それぞれの外部接続も別途確認します。

チャットの接続処理は、認証不要の OpenAI 互換サーバーでも空でない `OPENAI_API_KEY` を必要とします。その場合は `local-inference` などのダミー値を Secret に設定します。Ollama の埋め込みにはこの鍵は不要です。

## 運用で決めること

API とワーカーは個別に増やせます。DB の接続上限には API 全レプリカ、ベクトル検索、ワーカー、定期処理の接続を見込みます。埋め込みモデルを変更するときは、次元数が同じでも既存データの再索引計画が必要です。

`api.trustedProxyHops` は、導入先のプロキシ構成と転送ヘッダーの扱いを確認してから設定します。既定値では TCP の接続元を IP 制限に使います。入口では SSE のバッファリングを無効にし、回答の生成時間に合うタイムアウトを設定します。

ワーカーは SIGTERM を受けると新しい処理を取らず、実行中の処理を完了してから応答を削除して終了します。既定の実行上限は840秒で、900秒の DB リースより短くしています。中断した処理は、保存したチェックポイントとキューの再試行で回復します。CronJob の失敗、キューの滞留時間、デッドレターを監視してください。

DB・動画データ・暗号鍵はバックアップ対象です。Helm の切り戻しで戻るのはアプリの配置設定なので、SQL や動画データの復元手順は別に検証します。更新前のマイグレーションは、まだ稼働している旧バージョンとも互換性を保つ必要があります。破壊的な変更、Secret の更新、復旧の詳しい手順は Chart の README を参照してください。
