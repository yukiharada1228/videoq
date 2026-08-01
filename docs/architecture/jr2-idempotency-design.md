# JR-2 / JR-4 冪等性・失敗処理 設計書（非同期ジョブ）v2

- 種別: 設計書（残存設計事項）
- 対象: 要件定義書 §9 JR-2（冪等性）/ JR-4（統一失敗処理・DLQ）
- 版: 2.0（codex 実コードレビューで v1 の重大な穴を是正。[レビュー記録](./jr2-idempotency-design-review-codex.md)）
- 関連: [PoC #02（投入経路）](./poc-02-sqs-dispatch.md) / [PoC #04（原子的UPDATE）](./poc-04-quota-upload-race.md) / [移行要件定義書](./cloudflare-hono-migration-requirements.md)
- 作成日: 2026-08-01

> **v2 是正サマリ（v1 → v2）**: (1) PGVectorStore の `delete`+`add_texts` は **独立 PGEngine（Django DB と別コネクション、行ごと commit）のため単一 tx にできない** → 生 SQL の DELETE+bulk INSERT か generation swap へ。(2) stale 回収に **fencing token（run_token/lease）** が必須。(3) 台帳 `completed` は **同一 Django DB 副作用と同一 tx**、外部副作用は **outbox + reconciliation**。(4) 非 stale `running` の即 ack は禁止（retry へ）。(5) status 不一致の一律 ack は危険 → **owner/revision fencing**。(6) Celery eager retry（`apply(throw=True)`）は SQS 遅延 retry にならない → retry を SQS redrive に一本化。(7) evaluate_chat_log は **既に update_or_create で upsert 済み**（v1 の過剰設計）。(8) §7 は「exactly-once」ではなく「同一 PG tx 内の副作用のみ原子的、外部副作用は収束＋reconciliation で at-least-once を安全化」。

## 1. 背景と課題（実コード確認済み）

SQS は **at-least-once**（重複配信・順序保証なし）。現行 Lambda consumer（`lambda_handler.py`）は `task.apply(throw=True)` で同期実行するのみで、重複実行を防ぐ台帳が無い。

| タスク | 現状 | 実害 |
|---|---|---|
| index_video_transcript | `add_texts()` のみ（`scene_indexer.py:38`）。indexは先に vector 追加→`INDEXING→COMPLETED`（`index_video.py:47,55`） | 再配信で**ベクトル重複** |
| reindex_video_transcript | status guard **なし**・`delete_video_vectors`→`index`（別処理, `reindex_video_transcript.py:44,47`） | 途中失敗で**空窓**、別 enqueue 競合で不整合 |
| reindex_all_videos | 全削除→個別処理、失敗を集計しても `completed`（`reindex_all_videos.py:44`） | 失敗の握り潰し |
| delete_account_data | 各 step 例外を握り潰し（`delete_account_data.py:32`）、vector 削除失敗も video 行削除後に握り潰し（`django_user_data_deletion_gateway.py:22`） | **孤児 vector が恒久残存**（再試行時に video_id を列挙できない） |
| transcribe_video | `transition_status` ガードあり。ただし transcript commit と indexing 投入が `on_commit`（非原子, `task_gateway.py:32`）、usage 加算は非冪等で失敗握り潰し（`run_transcription.py:180`） | 部分的に冪等だが後続投入・usage に穴 |
| evaluate_chat_log | `update_or_create(chat_log_id)` + OneToOne（`django_evaluation_repository.py:29`） | **永続行の重複は既に防止済み**（外部 API 二重呼出は別問題） |

### 活用する既存レバー / 使えない前提
- **使える**: `transition_status(from,to)` = 条件付き UPDATE（`django_video_repository.py:344`）。`delete_video_vectors(video_id)` = メタデータ削除で冪等（`vector_store.py:141`）。
- **使えない（重要）**: **PGVectorStore は独立 `PGEngine`**（`vector_store.py:60`, Django の `DATABASES` とは別コネクション）で、`add_texts` は **行ごとに接続を開いて commit**（langchain-postgres 0.0.17）。→ **Django の `transaction.atomic()` で vector 書込を包めない**。

## 2. 設計方針：多層防御 + 副作用の commit 境界を明示

「台帳で at-most-once 化」だけでは不十分で、**副作用の種類ごとに原子性境界が異なる**ことを前提に設計する。

### レイヤ1 — 配信重複排除（fencing 付き claim 台帳）

**冪等キー = `headers.id`**（Worker が enqueue ごとに `crypto.randomUUID()`。PoC #02 で送出確認）。video_id は使わない（正当な再実行を許すため）。

```sql
CREATE TABLE job_execution (
  job_id          UUID PRIMARY KEY,        -- headers.id
  task_name        TEXT NOT NULL,
  payload_sha256   TEXT NOT NULL,          -- 正規化した args/kwargs のハッシュ（別 payload 事故の検出）
  status           TEXT NOT NULL,          -- running | completed | retryable_failed | failed
  attempts         INT  NOT NULL DEFAULT 0,
  run_token        UUID NOT NULL,          -- fencing: この実行の所有権
  claimed_at       TIMESTAMPTZ NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,   -- lease。超過で stale 回収可
  finished_at      TIMESTAMPTZ,
  error            TEXT
);
```

**claim（consumer 冒頭・短い独立 tx で commit してから `apply()` する）:**
```sql
INSERT INTO job_execution AS j
  (job_id, task_name, payload_sha256, status, attempts, run_token, claimed_at, lease_expires_at)
VALUES ($1, $2, $3, 'running', 1, $4, clock_timestamp(), clock_timestamp() + $5::interval)
ON CONFLICT (job_id) DO UPDATE
  SET status='running', attempts=j.attempts+1, run_token=EXCLUDED.run_token,
      claimed_at=clock_timestamp(), lease_expires_at=clock_timestamp()+$5::interval,
      finished_at=NULL, error=NULL
  WHERE j.task_name = EXCLUDED.task_name
    AND j.payload_sha256 = EXCLUDED.payload_sha256
    AND (j.status = 'retryable_failed'
         OR (j.status = 'running' AND j.lease_expires_at <= clock_timestamp()))
RETURNING attempts, run_token;
```
- **1 行返る**＝claim 成功（新規 / retryable_failed / stale 回収）→ その `run_token` を握って `apply()`。
- **0 行**＝`completed` か 非 stale `running` → **実行しない**。うち:
  - `completed` → **ack**（重複を握って正常終了）。
  - 非 stale `running` → **ack しない。`batchItemFailures` に入れて SQS に戻す**（後で visibility 経過後に再評価。所有者が完走すれば次回 `completed` を見てスキップ）。※即 ack すると所有者クラッシュ時にメッセージだけ消えてジョブ欠落。
- `xmax=0` の inserted 判定は使わない（実装依存）。初回/再取得の区別が要るなら `attempts` を使う。
- 原子性は PoC #04 の条件付き UPDATE と同型（2 重配信でも 1 つだけ claim）。

**完了/失敗（必ず run_token 条件・fencing）:**
```sql
UPDATE job_execution SET status='completed', finished_at=clock_timestamp()
WHERE job_id=$1 AND status='running' AND run_token=$2 RETURNING job_id;   -- 0 行なら所有権喪失=何もしない
```
失敗は `status='retryable_failed'`（一過性・再実行可）か `status='failed'`（恒久）に、同じく run_token 条件で更新。

### レイヤ2 — 副作用の原子性境界（種類別）

| 副作用の種類 | 原子性の扱い |
|---|---|
| **同一 Django DB**（video status / usage / plog 行 / 削除） | 最終 domain 更新 + **台帳 `completed` を同一 `transaction.atomic()`** に入れる。埋め込み等の重い計算は tx 外で行い、**永続化だけを短い tx** に。 |
| **ベクトル（別 PGEngine）** | `PGVectorStore.add_texts` を Django tx に**包めない**。→ (a) 生 SQL で **DELETE + bulk INSERT を 1 本の接続/tx**（`videoq_scenes` へ直接。埋め込みは事前生成）で vector・status・台帳をまとめて更新、または (b) 大規模再構築は **generation swap**（新テーブル/世代を作り、完成後に active を原子的に切替）。 |
| **外部（R2 / SQS 後続投入 / OpenAI）** | 単一 DB tx で保証不能。**transactional outbox** に「やること」を同一 tx で記録し、commit 後にワーカー/リレーが送出。`on_commit(send_task)` は非原子なので outbox へ置換（`indexing`/`build_plog` の後続投入）。 |

### ドメイン行の owner/revision fencing（status 不一致の正しい扱い）

`transition_status` の from 不一致を**一律 ack にしない**（index は不一致時点で既にベクトル副作用済みのことがある）。ドメイン行に **所有者・入力世代**を持たせる:
- `video.processing_job_id`（現在処理中の job）、`video.index_revision` / `transcript_revision`。
- **副作用の前に所有権を確認**、**最終 commit でも同じ owner/revision を条件**にする。
- 不一致時は現在 status・transcript revision・vector generation・outbox 有無を読んで **「既に完了」「古い入力」「要再試行」を分類**（下表）。

## 3. 失敗処理・DLQ（JR-4）

- **Celery `retry()` を本 consumer 経由で使わない**。`task.apply(throw=True)` は eager で、`self.retry()` は SQS に戻らず **1 invocation 内で再帰実行**（`max_retries=3` で最大 4 回 × `maxReceiveCount=3` ≈ 12 回、countdown 無視）。→ タスクは例外を 1 回で handler に返し、**retry は SQS visibility/redrive に一本化**。
- **DLQ**: 現行は `batchItemFailures` → `maxReceiveCount=3`（`infra/sqs.tf:20`）到達で DLQ（＝通常 redrive 後）。**「即 DLQ」は現構成では発生しない**。即時にしたいなら DLQ へ明示 `SendMessage` + 元メッセージ ack + IAM 追加が必要。
- **リトライ可否の分類**:
  - 対象不在（動画/ログ無し）→ 握って **ack**（DLQ に送らない）。
  - 一過性（OpenAI 5xx・DB 一時障害）→ **`batchItemFailures` で再配信**（台帳 `retryable_failed`）。
  - 恒久（バリデーション不能）→ 台帳 `failed`。即 DLQ にするなら上記の明示送出、しないなら redrive 後 DLQ。

## 4. タスク別（是正版）

| タスク | レイヤ1 | 副作用の原子性 | 補足 |
|---|---|---|---|
| transcribe_video | job_id claim | transcript+status+usage を同一 tx。indexing 投入は **outbox** | usage は job_id/revision で一意な usage-event にし握り潰さない |
| index_video_transcript | job_id claim | **生 SQL delete+bulk insert**（同一接続）で vector+status+台帳 | `add_texts` を原子化に使わない |
| reindex_video_transcript | job_id claim + **transcript_revision fencing** | 同上（delete+insert 同一 tx で空窓解消） | 別 job_id の 2 実行はレイヤ1で排他されない→video 単位 lock/revision で最終検証 |
| reindex_all_videos | 親 job + **子 job_id を決定的生成**（`hash(parent_job_id, video_id, revision)`） | **generation swap**（全削除方式を廃止） | 親再試行で子が重複しない |
| evaluate_chat_log | job_id claim | **既に update_or_create で upsert 済**（変更不要） | 外部評価 API の二重呼出のみ別途キー化 |
| build_plog_artifacts | job_id claim | **staging + active generation swap**（単なる (video_id) upsert では不足） | 各 save が別 tx・pipeline 全体が非原子のため |
| delete_account_data | job_id claim | 握り潰し撤廃。**work-item/outbox に R2 key・video_id を先に durable 保存**、または vectors を `user_id` 条件で DB 行削除と同一 tx | 再試行時に孤児 vector を列挙・再削除できる |

## 5. 実装配置・マイグレーション

1. `job_execution` 台帳（run_token / lease / payload_sha256 付き）と **outbox** テーブルを追加。
2. **consumer フック**（PoC #02 方式C と同時）: `lambda_handler` を「短い tx で claim commit → apply（run_token 保持）→ 同一 tx で domain+台帳 completed」で包む薄いラッパ。
3. **操作是正**: indexing/reindex を生 SQL delete+bulk insert 化、reindex_all を generation swap 化、build_plog を staging+swap 化、account_deletion の握り潰し撤廃＋outbox 化、`on_commit(send_task)` を outbox 化。
4. **ドメイン fencing**: `video.processing_job_id` / `transcript_revision` / `index_revision` 追加。
5. Worker 側: `headers.id`=`crypto.randomUUID()`（PoC #02 実装済）+ `payload_sha256`。
6. retry は SQS redrive に一本化、Celery `retry()` を consumer 経路から外す。

## 6. 正しさの根拠と限界（honest）

- claim の `INSERT ON CONFLICT ... WHERE ... RETURNING` と `transition_status` は、**PoC #04 で実測した原子的条件付き UPDATE と同型**（20/30 並行で超過ゼロ）→ 2 重配信でも 1 つだけ claim/遷移。
- **保証できるのは「同一 PostgreSQL transaction 内の副作用の原子性」まで**。ベクトル（別エンジン）・R2・SQS・外部 API は単一 tx で括れないため、**outbox + reconciliation で収束**させ、**at-least-once を安全化**する（＝実行は複数回起こり得るが、fencing・upsert・generation swap で**結果が収束**する）。
- したがって v1 の「実質 exactly-once」という表現は用いない。目標は **「同一 DB 副作用は atomic、外部副作用は冪等収束」**。

## 7. 未確定（実装時に決める）

- 台帳・outbox の置き場所: 既存 Postgres（tx 整合が容易・推奨）。
- lease 長（stale 判定）: 各タスク最長実行時間に合わせる（transcription は長い）。
- 「即 DLQ」を実装するか（明示 SendMessage）／redrive 後 DLQ で足りるか。
- generation swap を index/reindex/plog のどこまで適用するか（コスト対効果）。
- `evaluate_chat_log` の失敗を現行「再raiseしない」まま台帳記録に留めるか、DLQ 連動にするか。
