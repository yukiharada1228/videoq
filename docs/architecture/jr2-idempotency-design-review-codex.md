結論として、この設計は現状のままでは承認できません。クレーム SQL 自体の排他性は概ね正しい一方、台帳と副作用の commit 境界、stale 回収時の所有権、PGVectorStore の実トランザクション構造、status 不一致の扱い、Celery retry の挙動に重大な穴があります。「実質 exactly-once」という §6 の結論は削除または大幅修正が必要です。

## 1. クレーム SQL：排他性は正しいが、設計全体の singleton 実行は保証しない

[設計書 §2 レイヤ1](/Users/yukiharada/dev/videoq/docs/architecture/jr2-idempotency-design.md:46) の SQL について、次は正しいです。

- `ON CONFLICT DO UPDATE ... WHERE` の条件が偽なら競合行はロックされるものの更新されず、`RETURNING` は0行です。
- job_id が未登録なら一方が INSERT。もう一方は一意制約競合で待ち、先行 transaction の commit 後に `WHERE` を再評価して0行になります。
- 既存行が `failed` または stale `running` の場合も、一方が `running` に更新した後、後続は新しい行版に対して条件を再評価するので0行です。

これは PostgreSQL の仕様です。`ON CONFLICT DO UPDATE` は原子的 INSERT/UPDATE を保証し、条件は競合特定後に評価され、条件不成立行は `RETURNING` されません。[PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)、[Read Committed の競合動作](https://www.postgresql.org/docs/18/transaction-iso.html)

ただし、以下を修正すべきです。

### `xmax = 0` を correctness に使わない

`RETURNING (xmax = 0) AS inserted` はよく見かける実装依存テクニックですが、PostgreSQL が UPSERT 分岐判定 API として保証しているものではありません。`xmax` は可視行でも非0になり得ます。[PostgreSQL system columns](https://www.postgresql.org/docs/17/ddl-system-columns.html)

今回の判定に必要なのは「1行返ったか」だけなので、`inserted` は削除してください。初回か再取得かをログに残すなら、単調増加する `attempts` を返して `attempts = 1` で判定する方が安全です。

### claim transaction は task 実行前に必ず commit する

クレームを `transaction.atomic()` で `task.apply()` と一緒に包むと、競合 consumer はタスク終了まで一意制約/行ロックを待ちます。§2 に「クレームは短い独立 transaction で確定してから `apply()`」と明記すべきです。

### stale 回収には所有者トークンが必要

現行案の完了・失敗 UPDATE は job_id しか条件にしていません。[設計書](/Users/yukiharada/dev/videoq/docs/architecture/jr2-idempotency-design.md:63)

例えば A が停止したと判断され、B が stale 回収した後に A が復帰すると、A が B の実行を `completed` や `failed` に上書きできます。`run_token` または世代番号を発行し、heartbeat、完了、失敗をすべて token 付き条件 UPDATE にする必要があります。

修正版の概形は以下です。

```sql
INSERT INTO job_execution AS j (
  job_id,
  task_name,
  payload_sha256,
  status,
  attempts,
  run_token,
  claimed_at,
  lease_expires_at
)
VALUES (
  $1, $2, $3, 'running', 1, $4,
  clock_timestamp(),
  clock_timestamp() + $5::interval
)
ON CONFLICT (job_id) DO UPDATE
SET status           = 'running',
    attempts         = j.attempts + 1,
    run_token        = EXCLUDED.run_token,
    claimed_at       = clock_timestamp(),
    lease_expires_at = clock_timestamp() + $5::interval,
    finished_at      = NULL,
    error            = NULL
WHERE
  j.task_name = EXCLUDED.task_name
  AND j.payload_sha256 = EXCLUDED.payload_sha256
  AND (
    j.status = 'retryable_failed'
    OR (
      j.status = 'running'
      AND j.lease_expires_at <= clock_timestamp()
    )
  )
RETURNING job_id, status, attempts, run_token;
```

完了・失敗も次の形にします。

```sql
UPDATE job_execution
SET status = 'completed',
    finished_at = clock_timestamp()
WHERE job_id = $1
  AND status = 'running'
  AND run_token = $2
RETURNING job_id;
```

0行なら所有権を失っているため、その consumer が勝手に completed を確定してはいけません。

また、同じ job_id で異なる task/args が届く事故を検出するため、`task_name` だけでなく正規化した args/kwargs のハッシュを保存すべきです。

### 非 stale `running` を即 ack するのは危険

[設計書の「スキップして ack」](/Users/yukiharada/dev/videoq/docs/architecture/jr2-idempotency-design.md:60) は `completed` には正しいですが、`running` には安全ではありません。

重複 delivery 側が ack した直後に所有者がクラッシュすると、SQS メッセージが削除され、stale 台帳だけが残る可能性があります。SQS は receive ごとに異なる receipt handle を返し、最新 handle での削除がメッセージを削除し得ます。[AWS DeleteMessage](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html)

次のどちらかが必要です。

- `completed` は ack、非 stale `running` はタスクを実行せず `batchItemFailures` に返す。
- または payload を台帳に保存し、stale job を再投入する独立 sweeper/reconciler を実装する。その場合のみ busy duplicate の ack を許可する。

## 2. 台帳と副作用の commit 境界

[§2 レイヤ2](/Users/yukiharada/dev/videoq/docs/architecture/jr2-idempotency-design.md:73) は問題を認識していますが、解決方法が不足しています。

| completed の確定位置 | 結果 |
|---|---|
| 副作用 commit より前 | completed 後に失敗すると処理欠落 |
| 副作用 commit 後、別 transaction | その間のクラッシュで再配信時に二重実行 |
| 副作用と同じ transaction | 同一 DB の副作用については安全 |
| 別 DB・R2・SQS・外部 API | 単一 DB transaction では解決不能 |

したがって、Django DB 内の副作用は、最終的な domain 更新と台帳 `completed` を同じ `transaction.atomic()` に入れるべきです。クラッシュが commit 前なら両方 rollback、commit 後なら再配信は completed を見てスキップできます。

ただし `task.apply()` 全体を長時間 transaction に入れるのは避けます。文字起こしや embedding を transaction 外で計算し、最後の永続化だけを短い transaction にします。

SQS への後続ジョブ投入も現在の `transaction.on_commit()` では原子的ではありません。[task_gateway.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/tasks/task_gateway.py:32) は DB commit 後に `send_task()` するため、DB commit 成功後に SQS send が失敗する窓があります。Django 自身も `on_commit` callback は transaction の一部ではないと明記しています。[Django transactions](https://docs.djangoproject.com/en/6.0/topics/db/transactions/)

`indexing`、`build_plog` 等の後続投入は transactional outbox に置き換えるべきです。

## 3. PGVector の「delete + add_texts を単一 tx」は現実装では不可能

この点は明確に反証できます。

- Django は `DATABASES["default"]` を使います。
- PGVectorStore は同じ URL から独立した SQLAlchemy `AsyncEngine` を生成しています。[vector_store.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/vector_store.py:59)
- `delete_video_vectors()` は PGVectorStore の独立接続を使用します。[vector_store.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/vector_store.py:136)
- 現在の workspace に入っている `langchain-postgres 0.0.17` は、delete ごとに接続を開いて明示 commit します。[async_vectorstore.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/langchain_postgres/v2/async_vectorstore.py:472)
- `add_texts()` は ID 未指定時に各 scene へランダム UUID を発行し、さらに1行ごとに接続を開いて commit します。[async_vectorstore.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/langchain_postgres/v2/async_vectorstore.py:285)、[同 commit](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/langchain_postgres/v2/async_vectorstore.py:367)

したがって `transaction.atomic()` を外側に追加しても、

```text
Django transaction
PGVector delete transaction
scene 1 insert transaction
scene 2 insert transaction
...
```

となり、単一 transaction にはなりません。`add_texts()` 自体も途中まで commit 済みになるため、部分 index が残ります。

[§2 lines 77–78](/Users/yukiharada/dev/videoq/docs/architecture/jr2-idempotency-design.md:77) は次のいずれかに修正してください。

- Embedding を transaction 外で生成し、Django の同じ接続上で `DELETE` と bulk INSERT、video status、台帳 completed を一括 commit する。
- または1本の SQLAlchemy connection/transaction 上で vectors、video status、台帳をすべて直接 SQL 更新する。
- 大規模再構築なら `index_generation` 付き staging を作り、完成後に active generation を原子的に切り替える。

現在の `PGVectorStore.add_texts()` をそのまま呼んで単一 tx 化する案は不可です。

## 4. status 不一致を一律「良性スキップ」にしてはいけない

[§2 line 79](/Users/yukiharada/dev/videoq/docs/architecture/jr2-idempotency-design.md:79) は削除し、タスク固有の reconciliation に置き換えるべきです。

理由は次の通りです。

- index は先に vectors を追加し、その後 `INDEXING → COMPLETED` を実行します。[index_video.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/index_video.py:47)、[status 更新](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/index_video.py:55)  
  status 不一致が起きた時点で、既にベクトル副作用が発生しています。
- transcription では開始 transition が失敗しても catch 節が `PROCESSING → ERROR` を試みます。[run_transcription.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/run_transcription.py:128)、[failure transition](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/run_transcription.py:162)  
  別 job_id の正規実行が `processing` 中なら、競合ジョブがそれを `error` に落とせます。
- `InvalidVideoStatusTransition` は期待した from/to しか持たず、実際の現在 status、所有 job、部分副作用の有無を示しません。[django_video_repository.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_video_repository.py:337)

必要なのは、

- `processing_job_id` / `index_revision` などの所有者・入力世代を domain 行に保持する。
- 副作用前に所有権を確認する。
- 最終 commit 時にも同じ所有者・revision を条件にする。
- 不一致時は現在 status、transcript revision、vector generation、outbox の有無を読んで「既に完了」「古い入力」「再試行必要」を分類する。

という task-specific な処理です。

## 5. JR-4 の retry/DLQ 前提にも誤りがある

### Celery retry は SQS 遅延 retry にならない

consumer は `task.apply(..., throw=True)` で同期・eager 実行しています。[lambda_handler.py](/Users/yukiharada/dev/videoq/backend/lambda_handler.py:94)

このモードでは Celery の `self.retry(countdown=...)` は SQS に戻らず、`apply()` 内で即時に再帰実行されます。[Celery task.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/celery/app/task.py:868)

したがって現状は、例えば `max_retries=3` のタスクが1回の Lambda invocation 内で最大4回連続実行され、その SQS delivery 自体が失敗すると再配信後にまた最大4回実行されます。IaC の `maxReceiveCount=3` と組み合わさると最大約12回で、`countdown=60/120/...` も実質無視されます。

[§3](/Users/yukiharada/dev/videoq/docs/architecture/jr2-idempotency-design.md:83) に以下を追記すべきです。

- Lambda consumer 経由では Celery `retry()` を使わず、例外を1回で handler に返し、SQS visibility/redrive に retry を一本化する。
- または consumer が Celery `Retry` を解釈して別 SQS メッセージを遅延投入する専用実装を作る。

### 「NonRetryableError で即 DLQ」は現構成では実現しない

現在の handler は例外を `batchItemFailures` に入れるだけです。[lambda_handler.py](/Users/yukiharada/dev/videoq/backend/lambda_handler.py:52)  
DLQ 転送は `maxReceiveCount=3` 到達後です。[infra/sqs.tf](/Users/yukiharada/dev/videoq/infra/sqs.tf:20)、[AWS DLQ](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)

「即 DLQ」にするなら、DLQ に明示的に SendMessage して元メッセージを ack する処理と IAM 権限が必要です。それをしないなら文言を「通常の redrive 後に DLQ」へ直してください。

## 6. タスク固有の見落とし・過剰設計

- `transcribe_video`
  - transcript/status commit と indexing 投入の間に outbox が必要です。[run_transcription.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/run_transcription.py:153)
  - processing usage は本体 commit 後の非冪等な加算で、失敗を握り潰しています。[run_transcription.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/run_transcription.py:180)  
    job_id または video/revision に一意な usage event として同一 DB tx に入れるべきです。

- `index/reindex`
  - job_id が異なる2つの正当な enqueue はレイヤ1では排他されません。現行 reindex は status guard なしで delete→add します。[reindex_video_transcript.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/reindex_video_transcript.py:38)
  - transcript revision をメッセージに含め、video 単位の lock/fencing と最終 revision 検証が必要です。

- `reindex_all_videos`
  - 全削除後に個別処理する方式自体を廃止すべきです。[reindex_all_videos.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/reindex_all_videos.py:44)
  - embedding model 切替なら新 generation/table を完全構築し、検証後に active generation を切り替えるべきです。
  - 「動画ごとに子 job_id」は、parent 再試行ごとにランダム生成すると重複します。`parent_job_id + video_id + transcript_revision` から決定的に生成してください。

- `evaluate_chat_log`
  - 「upsert 化」は既に実装済みです。repository は `chat_log_id` で `update_or_create`、model は OneToOne です。[django_evaluation_repository.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_evaluation_repository.py:28)、[model](/Users/yukiharada/dev/videoq/backend/app/infrastructure/models/evaluation.py:12)
  - §2 line 81 と §4 の「要 upsert」は過剰設計なので、「既存実装で永続行重複は防止済み」に直してください。ただし外部評価 API の二重呼出しは別問題です。

- `build_plog`
  - artifacts を先に削除し、その後に複数の外部処理を実行しています。[build_artifacts.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/plog/build_artifacts.py:64)
  - 各 save は個別 transaction であり、pipeline 全体は原子的ではありません。[django_plog_repository.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_plog_repository.py:150)
  - `build_job/revision` ごとの staging に保存し、最後に active build を切り替える設計が必要です。単なる `(video_id) upsert` では不足します。

- `delete_account_data`
  - use case が各 step の例外を握り潰します。[delete_account_data.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/auth/delete_account_data.py:32)
  - さらに vector 削除失敗も、video 行を削除した後で握り潰しています。[django_user_data_deletion_gateway.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_user_data_deletion_gateway.py:22)  
    再試行時には video_id を列挙できず、孤児 vector が永久に残ります。
  - R2 file key、video_id、削除 step を先に durable work item/outbox として保存するか、同じ Postgres 上の vectors は `user_id` 条件で DB 行削除と同一 tx に入れるべきです。

## 設計書の最終的な修正方針

最低限、次を反映すべきです。

1. §2 レイヤ1を「原子的 claim + lease token + fencing + payload hash」に変更。
2. `running` duplicate の即 ack を禁止するか、stale sweeper を追加。
3. §2 レイヤ2から「PGVectorStore の delete+add_texts を transaction.atomic で包む」を削除し、単一 connection での bulk write または generation swap に変更。
4. status 不一致の一律 ack を削除し、task/revision/owner ごとの reconciliation 表を追加。
5. 台帳 completed と同一 tx に入る副作用、outbox が必要な副作用、外部冪等キーが必要な副作用を明示的に分類。
6. Celery eager retry と SQS retry の二重構造を解消。
7. §6 の「実質 exactly-once」を「同一 PostgreSQL transaction 内の副作用のみ atomic。外部副作用は収束・reconciliation により at-least-once を安全化」に修正。

ファイルは編集していません。