# バックエンドのクリーンアーキテクチャレビュー

作成日: 2026-03-06
対象: `backend/app` 一式（`domain` / `use_cases` / `infrastructure` / `presentation` / `tasks`）

## 結論

現状は**「概ねクリーンアーキテクチャに沿っているが、完全ではない」**です。

- 良い点: `domain` と `use_cases` から Django/DRF/ORM への直接依存は見当たりません。
- 課題: DI 境界の運用が一貫しておらず、`get_container()` 直呼びが複数レイヤーに残っています。

---

## Findings（重大度順）

### 1. `get_container()` 直呼びが境界層に広く残り、DI 方針が不統一（Medium）

`video` コンテキストは `app.dependencies.*` 経由へ移行済みですが、他領域は Service Locator (`get_container`) 直呼びが残っています。

- `backend/app/presentation/auth/views.py:30`
- `backend/app/presentation/chat/views.py:16`
- `backend/app/presentation/media/views.py:12`
- `backend/app/common/authentication.py:12`
- `backend/app/tasks/account_deletion.py:10`
- `backend/app/tasks/reindexing.py:10`

影響:

- エントリーポイントごとに依存解決パターンが異なり、テスト差し替えの方法が統一されない。
- 将来的に DI ルールを静的検証しづらい。

補足:

- 移行済み箇所では `app.dependencies.video` / `app.dependencies.auth` / `app.dependencies.tasks` が既に存在しており、方向性自体は良いです。

### 2. アーキテクチャ検証テストの適用範囲が「部分移行」前提で、ルールが全体に効いていない（Medium）

`get_container` 禁止テストは「migrated entrypoints」3ファイルに限定されています。

- `backend/app/tests/test_import_rules.py:413`
- `backend/app/tests/test_import_rules.py:432`
- `backend/app/tests/test_import_rules.py:435`
- `backend/app/tests/test_import_rules.py:438`

影響:

- 現在のテストでは、未移行領域に `get_container()` が増えても検知できません。
- 設計意図（依存解決をどこで行うか）がコードベース全体で拘束されません。

### 3. Chat use case が `domain.video` 契約へ直接依存し、境界コンテキスト間の結合がある（Low）

`GetPopularScenesUseCase` が `domain.chat` だけでなく `domain.video` のポート/リポジトリに依存しています。

- `backend/app/use_cases/chat/get_popular_scenes.py:9`
- `backend/app/use_cases/chat/get_popular_scenes.py:10`

影響:

- `chat` コンテキストが `video` コンテキストの契約に引っ張られる。
- 将来的に bounded context を分離したい場合の変更コストが上がる。

備考:

- 機能要件上妥当な依存でもあるため、現時点では「違反」ではなく「結合度リスク」です。

---

## 良い実装ポイント

- `domain` 層が純粋なエンティティ/抽象契約中心で、フレームワーク非依存。
  - 例: `backend/app/domain/video/entities.py`, `backend/app/domain/video/repositories.py`
- `use_cases` 層から `app.models` / Django / DRF / `app.infrastructure` への直接依存は確認できず、依存方向は維持されている。
- `infrastructure` 層が ORM 実装を担当し、`domain` 契約を実装している。
  - 例: `backend/app/infrastructure/repositories/django_video_repository.py`
- インポート境界の自動検証テストが整備されている。
  - 例: `backend/app/tests/test_import_rules.py`

---

## テスト実行結果（docker compose exec）

ユーザー依頼に基づき、コンテナ内で以下を実行。

- `docker compose exec backend python manage.py test app.tests.test_import_rules -v 2`

結果:

- 実行テスト数: 37
- 結果: `OK`（全件成功）
- 実行時間: `0.220s`
- scan_counts: `{'domain': 30, 'use_cases': 52, 'presentation': 21, 'infrastructure': 43, 'tasks': 6, 'common': 7}`

補足:

- ローカル直実行（ホスト側）は `pytest` / `django` 未導入で失敗したが、Docker 環境では正常に検証できた。

---

## 推奨アクション（優先順）

1. `presentation` / `common` / `tasks` の依存解決を `app.dependencies.*` 経由へ統一する。
2. `test_import_rules.py` の `get_container` ルールを全対象ファイルへ拡大する（段階移行なら allowlist を明示）。
3. `chat` が必要とする動画参照機能を `chat` 側ポートとして再定義し、`domain.video` 直接依存を縮小する。
