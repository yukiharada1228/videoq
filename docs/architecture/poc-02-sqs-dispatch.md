# PoC #02: 非同期ジョブ投入（Worker → SQS → 既存 Lambda consumer）

- 種別: 移行 PoC 手順・結果
- 対象: 要件定義書 §9（Celery/SQS 投入方式 A/B/C と冪等性 JR-2/JR-4）
- 関連: [移行要件定義書](./cloudflare-hono-migration-requirements.md) / [PoC #01](./poc-01-pgvector-cross-runtime-search.md)
- 作成日: 2026-08-01
- スクリプト: [`poc/worker-sqs-dispatch/`](../../poc/worker-sqs-dispatch/)

## 1. 目的

Cloudflare Worker が投入したジョブを、**既存の Lambda consumer（`backend/lambda_handler.py`）が改修なしで受理し、正しいタスク・引数でディスパッチできるか**を実測する。

## 2. 消費側の契約（`lambda_handler._execute_task` を精読）

Lambda は通常の Celery worker ではなく、以下だけを読む独自アダプタ:
- 外側 SQS body: **plain JSON をそのまま受理**（`json.loads` 失敗時のみ base64 デコードにフォールバック）。→ Worker は外側 base64 不要。
- 必須 3 フィールド: `headers.task`（タスク名）/ `headers.id`（省略時 "unknown"）/ `body`（= `base64(utf8(json([args, kwargs, embed])))`, 3 要素配列）。
- `properties`/`eta`/`retries`/`content-encoding` 等の Celery/kombu メタは**すべて無視**。
- 実行は `task.apply(args, kwargs, task_id)`（同期）。

## 3. 実測結果（すべて合格, 2026-08-01）

本物の `lambda_handler._execute_task` を呼び、`task.apply` のみモックして副作用を止めて検証（[`verify_dispatch.py`](../../poc/worker-sqs-dispatch/verify_dispatch.py)）。

- **(A) Celery golden**（`amqp.as_task_v2` 生成 + kombu 相当の外側 base64）→ `transcribe_video(args=[123])` ディスパッチ。
- **(B) Worker 最小 plain-JSON**（3 フィールドのみ）→ **同一の** `transcribe_video(args=[123])` ディスパッチ。→ **フル Celery エンベロープ不要、ゼロ Lambda 改修で成立**。
- **(C) JS Worker 生成**（`btoa(JSON.stringify([[123],{},{}]))` + `crypto.randomUUID`, [`build_message.mjs`](../../poc/worker-sqs-dispatch/build_message.mjs)）→ 既存 Lambda が受理・同一ディスパッチ。JS と Python の JSON 空白差（`[[123],{},{}]` vs `[[123], {}, {}]`）は `json.loads` が吸収し無害。

### 送信経路（Worker → SQS）も実 workerd で実測
`softwaremill/elasticmq`（SQS 互換）を起動し、**aws4fetch(SigV4) を使う Hono Worker を `wrangler dev` で実行** → `SendMessage` → キュー着信 → `ReceiveMessage` → 受信 body を本物の `lambda_handler` に投入、の**全経路が通ることを確認**:
- Worker `SendMessage`: **status 200 / MessageId 発行**（`aws4fetch SigV4 on workerd`）。
- 受信 body を lambda_handler が受理し `transcribe_video(args=[123])` を Worker の UUID 付きでディスパッチ。→ **Worker → SQS → consumer の全経路 PASS**。

## 4. 方式 A/B/C の結論（要件 §9 の更新）

- **方式 B は「今すぐ・ゼロ Lambda 改修」で成立**（実測）。Worker は最小 JSON を `aws4fetch` で `SendMessage` するだけ。→ ジョブ投入は移行初日から Worker 直投入が可能で、**Django ディスパッチ残置（方式 A）は必須ではない**（ストラングラー期間に Django ルートが残る間の暫定策としては引き続き有効）。
- **方式 C（`{version, task, job_id, args}` の素の JSON, 内側 base64 なし）** は Worker を Celery 内部形式から完全に切り離す改善だが、Lambda に分岐追加が必要。**冪等性導入（後述）で Lambda を触るタイミングに合わせて実施**するのが合理的。
- 更新後の推奨: **方式 B で直接投入（ゼロ改修）→ 冪等性対応と同時に方式 C へ整形**。

## 5. 残課題

### 5.1 ライブ AWS SQS 疎通 — 実測合格（2026-08-01）
実 AWS（ap-northeast-1）に**使い捨ての一時キュー `videoq-poc-sqs-test`**（event source mapping なし、本番 `videoq-worker-*-prod` には非接触）を作成し、`wrangler dev`（workerd）の Worker から **aws4fetch(SigV4) + 実 IAM 資格情報**で `SendMessage`:
- **実 AWS が署名を受理: status 200 / 実 AWS MessageId 発行**（ElasticMQ と異なり実 AWS は署名検証するため、これで SigV4 が本番通用と確定）。
- `aws sqs receive-message` で取得した body は Worker 送信内容と一致。その body を本物の `lambda_handler` に投入 → `transcribe_video(args=[123])` を Worker の UUID 付きでディスパッチ。→ **Worker → 実 AWS SQS → consumer の全経路 PASS**。
- 安全対策: 一時キューは削除済み。実資格情報は `.dev.vars`（gitignore・非表示リダイレクト）で扱い、検証後に削除。本番キュー・本番 Lambda には一切送信していない（実タスクは未実行）。
- 実運用の IAM は `sqs:SendMessage` のみに限定すること（要件 JR-5）。

### 5.2 冪等性（JR-2 / JR-4）— **新規設計が必要**（本 PoC のスコープ外, 設計事項）
- 現行に `job_id` による重複排除台帳は**無い**（Lambda は Celery task id を `apply` に渡すのみ）。SQS は at-least-once のため**重複配信が起こりうる**。
- 重複時の実害（要件で確認済み）: 初回 index は `add_texts()` で**ベクトル重複**、個別 reindex は delete→insert のため**途中失敗でベクトル消失**。
- 推奨: `headers.id`（または方式 C の `job_id`）を冪等キーに、**処理済み台帳（DB）を Lambda 側で確認**してから `apply`。index 系は delete-then-insert / upsert で冪等化。統一的な失敗ステータス更新 + DLQ 連動（JR-4）も同時に設計。

## 6. 安全上の注意

- `verify_dispatch.py` は `task.apply` をモックし**実タスクを実行しない**（transcription 等の副作用なし）。DB・OpenAI・ffmpeg には一切触れない。
- ローカル ElasticMQ は使い捨て（検証後にコンテナ削除済み）。
