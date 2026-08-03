# Django 依存完全切断（Cutover）

> ステータス: **完了**（スコープ C: Drizzle + Lambda Django レス）  
> 関連: [cloudflare-hono-migration-requirements.md](./cloudflare-hono-migration-requirements.md)

## 実施サマリ

| Phase | 内容 | 成果物 |
|---|---|---|
| 0 | インベントリ | 本文書 |
| 1 | Drizzle 正本 | `apps/api/src/db/schema/*`, `withDb`, `drizzle/0000_init.sql` |
| 2 | Hono repositories | 全 repository が Drizzle query builder（vector `<=>` 等は `db.execute(sql)`） |
| 3 | Worker | `apps/worker/`（django/celery なし、タスク名互換） |
| 4 | Django 撤去 | `archive/django-backend/` + トップレベル `backend/` 撤去 + CI/CD / docs 更新 |

## 完了定義

| # | ゲート | 判定 |
|---|---|---|
| G1 | Web API が Hono のみ | **達成** — Django API プロセス不要（本番） |
| G2 | スキーマ正本が Drizzle | **達成** — `apps/api` の drizzle-kit が DDL 所有者。Django migrations は archive 内で凍結 |
| G3 | Hono repositories が Drizzle 経由 | **達成** — query builder 本線。複雑 SQL / OAuth txn のみ `db.execute` / `BEGIN` |
| G4 | Worker Lambda が `django` / `celery` / `oauth2_provider` 非依存 | **達成** — `apps/worker` デプロイ単位（import ゼロ） |
| G5 | `backend/` Django ツリー削除または archive | **達成** — `archive/django-backend/`。トップレベル `backend/` は撤去済み（`apps/api` + `apps/worker`） |

## 残存 Django 依存インベントリ（切断後）

| 領域 | 現状 | 状態 |
|---|---|---|
| Web API | `apps/api/` | 切断済 |
| Schema DDL | `apps/api/drizzle/` | Drizzle 正本。旧 migrations は archive |
| Admin | `/api/ops/` | Django admin 不要 |
| OAuth DOT | Hono + 既存テーブル名 | 切断済（テーブル名は維持） |
| Worker jobs | `apps/worker/` | 切断済（重いパイプラインは stub / `ENABLE_HEAVY_PIPELINE`） |
| 共有鍵 | `JWT_SECRET` = 旧 `SECRET_KEY` | アルゴリズム互換のまま維持（Django 不要） |
| パスワード | `pbkdf2_sha256` | Hono `lib/password.ts` |
| CSRF / uid token | Django 互換実装 | Hono に移植済 |
| ローカル Docker | compose 既定（Caddy+api+worker+migrate+MinIO+ElasticMQ） | legacy profile のみ archive Django |

### Worker タスク一覧（G4）

| Task name | モジュール |
|---|---|
| `app.entrypoints.tasks.transcription.transcribe_video` | `worker_python/tasks/transcription.py` |
| `app.entrypoints.tasks.build_plog.build_plog_artifacts_task` | `worker_python/tasks/build_plog.py` |
| `app.entrypoints.tasks.evaluation` (EVALUATE_CHAT_LOG) | `worker_python/tasks/evaluation.py` |
| `app.entrypoints.tasks.reindex_video_transcript` | `worker_python/tasks/reindex_video_transcript.py` |
| `app.entrypoints.tasks.reindexing.reindex_all_videos_embeddings` | `worker_python/tasks/reindexing.py` |
| `app.entrypoints.tasks.indexing` | `worker_python/tasks/indexing.py` |
| `DELETE_ACCOUNT_DATA_TASK` | `worker_python/tasks/account_deletion.py` |

## Worker パイプライン（`apps/worker`）

| 領域 | 状態 |
|---|---|
| transcription → indexing 連鎖 | SQS または inline |
| FFmpeg + Whisper / YouTube | `ENABLE_HEAVY_PIPELINE=1` |
| Scene-Otsu 分割 | `pipeline/scene_otsu`（transcription 後, max_tokens=512） |
| PGVector (`videoq_scenes`) | OpenAI / Ollama embeddings + raw SQL（langchain 不要） |
| build_plog | LLM inventory + prerequisite chain（簡易版） |
| evaluation | OpenAI JSON scores（stub fallback） |
| account deletion | SQL + R2/S3/local + vector delete |

## 非ゴール（後続）

- テーブルリネーム（`app_user` → `users`）
- Worker の Cloudflare Containers 全面移管
- 完全 ragas ライブラリ（現行は OpenAI JSON rubric）
- OAuth スキーマ外カラム（`resource` / `token_checksum` 等）の introspect 取り込み

## 運用メモ

- Hyperdrive: per-request `pg.Client`。Drizzle は `withDb` 内でのみ `drizzle(client)`。
- スキーマ変更: `cd apps/api && npm run db:generate` → `npm run db:migrate`（stamp + migrate。`manage.py migrate` 禁止）
- ローカル: `docker compose up --build -d` が `migrate` サービスを先に実行してから api/worker を起動
- CD: `.github/workflows/cd.yml` の `db-migrate` が `DATABASE_URL` secret で `npm run db:migrate`
- Worker デプロイ: `apps/worker/Dockerfile` → ECR → Lambda
- 旧 Django 参照: `archive/django-backend/`（デプロイ禁止）
- ローカルオブジェクトストレージ: MinIO（compose 既定）。キーは `media/<file_key>`
- ローカルキュー: ElasticMQ（compose 既定）。Worker が long-poll
