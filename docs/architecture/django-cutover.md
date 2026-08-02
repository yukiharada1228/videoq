# Django 依存完全切断（Cutover）

> ステータス: **完了**（スコープ C: Drizzle + Lambda Django レス）  
> 関連: [cloudflare-hono-migration-requirements.md](./cloudflare-hono-migration-requirements.md)

## 実施サマリ

| Phase | 内容 | 成果物 |
|---|---|---|
| 0 | インベントリ | 本文書 |
| 1 | Drizzle 正本 | `backend-hono/src/db/schema/*`, `withDb`, `drizzle/0000_baseline.sql` |
| 2 | Hono repositories | 全 repository が `withDb`（vector は raw SQL） |
| 3 | Worker | `worker-python/`（django/celery なし、タスク名互換） |
| 4 | Django 撤去 | `archive/django-backend/` + CI/CD / docs 更新 |

## 完了定義

| # | ゲート | 判定 |
|---|---|---|
| G1 | Web API が Hono のみ | **達成** — Django API プロセス不要（本番） |
| G2 | スキーマ正本が Drizzle | **達成** — `backend-hono` の drizzle-kit が DDL 所有者。Django migrations は archive 内で凍結 |
| G3 | Hono repositories が `withDb` 経由 | **達成** — 全 repository が `withDb`。vector / 互換 SQL は `client.query` 可 |
| G4 | Worker Lambda が `django` / `celery` / `oauth2_provider` 非依存 | **達成** — `worker-python` デプロイ単位（import ゼロ） |
| G5 | `backend/` Django ツリー削除または archive | **達成** — `archive/django-backend/`。`backend/` は README + 互換 shim のみ |

## 残存 Django 依存インベントリ（切断後）

| 領域 | 現状 | 状態 |
|---|---|---|
| Web API | `backend-hono/` | 切断済 |
| Schema DDL | `backend-hono/drizzle/` | Drizzle 正本。旧 migrations は archive |
| Admin | `/api/ops/` | Django admin 不要 |
| OAuth DOT | Hono + 既存テーブル名 | 切断済（テーブル名は維持） |
| Worker jobs | `worker-python/` | 切断済（重いパイプラインは stub / `ENABLE_HEAVY_PIPELINE`） |
| 共有鍵 | `JWT_SECRET` = 旧 `SECRET_KEY` | アルゴリズム互換のまま維持（Django 不要） |
| パスワード | `pbkdf2_sha256` | Hono `lib/password.ts` |
| CSRF / uid token | Django 互換実装 | Hono に移植済 |
| ローカル Docker | `docker-compose.yml` → archive | 開発利便のためのレガシー経路のみ |

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

## 非ゴール（後続）

- テーブルリネーム（`app_user` → `users`）
- Worker の Cloudflare Containers / Whisper 全面移管
- 重いパイプライン（FFmpeg/Whisper/RAGAS/vector）の本番同等移植
- pgvector の query builder 完全化
- ローカル Docker を Workers + django-free worker のみに置き換え

## 運用メモ

- Hyperdrive: per-request `pg.Client`。Drizzle は `withDb` 内でのみ `drizzle(client)`。
- スキーマ変更: `cd backend-hono && npx drizzle-kit generate|migrate`（`manage.py migrate` 禁止）
- Worker デプロイ: `worker-python/Dockerfile` → ECR → Lambda
- 旧 Django 参照: `archive/django-backend/`（デプロイ禁止）
