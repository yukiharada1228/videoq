# Backend Clean Architecture Review (2026-03-06)

## Verdict
結論: **概ねクリーンアーキテクチャに沿っていますが、完全ではありません。**

- 良い点
  - `domain / use_cases / infrastructure / presentation` の層分離が明確。
  - `domain` は dataclass ベースで、Django/DRF 依存が入っていない（例: `backend/app/domain/video/entities.py`）。
  - import ルールの自動検査があり、禁止依存を CI で検知する設計になっている（`backend/app/tests/test_import_rules.py`）。

## Findings (Severity Order)

### 1. Medium: Service Locator 依存が広く、依存関係が隠蔽される
- 根拠
  - グローバルコンテナシングルトン: `backend/app/container.py:193-201`
  - View から直接 `get_container()` 呼び出し: `backend/app/presentation/video/views.py:83-85`, `:107-109`, `:173`
  - Permission/Task でも直接呼び出し: `backend/app/common/permissions.py:19`, `:58`, `backend/app/tasks/transcription.py:22`
- 影響
  - 依存がコンストラクタに現れず、静的追跡しづらい。
  - テスト時にグローバル差し替え前提になり、並列実行や副作用管理が難しくなる。
  - クリーンアーキテクチャの「依存注入による明示性」が弱まる。
- 改善案
  - HTTP/Celery エントリポイントで use case を組み立て、クラス/関数引数で注入する方向へ段階的に移行。
  - まずは新規コードだけでも constructor injection を優先し、既存 `get_container()` 呼び出しを増やさない運用にする。

### 2. Low: 権限スコープ定義の配置がアプリケーション層実装に寄っている
- 根拠
  - `app.common.permissions` が `app.use_cases.auth.authorize_api_key` から定数を import:
    `backend/app/common/permissions.py:8`
- 影響
  - スコープ定義が特定 use case モジュールに属しており、ポリシーの再利用/再配置時に影響範囲が広がる。
  - 層違反ではないが、責務境界（ポリシー定義 vs ユースケース実装）が曖昧。
- 改善案
  - `domain/auth` 配下などに `ScopePolicy`（または定数モジュール）を切り出し、`common` と `use_cases` の双方がそこを参照する。

## Positive Evidence (Why "mostly clean")
- 境界ルールがテストで明文化されている
  - `domain` から `django/rest_framework/app.infrastructure` を禁止:
    `backend/app/tests/test_import_rules.py:163-168`
  - `use_cases` から `app.models/django/rest_framework/app.infrastructure` を禁止:
    `backend/app/tests/test_import_rules.py:187-190`
  - `presentation` から `app.models/app.infrastructure` を禁止:
    `backend/app/tests/test_import_rules.py:199-203`
  - `infrastructure` から `app.use_cases` を禁止:
    `backend/app/tests/test_import_rules.py:256-258`
- 実装サンプルでも依存方向は概ね順守
  - `CreateVideoUseCase` は `domain` の port/repository に依存:
    `backend/app/use_cases/video/create_video.py:8-14`, `:27-35`
  - `domain` エンティティはフレームワーク非依存:
    `backend/app/domain/video/entities.py:8-10`, `:13-84`

## Validation Notes
- `docker compose exec` で import ルールテストを実行し、成功を確認。
  - 実行コマンド:
    `docker compose exec backend python manage.py test app.tests.test_import_rules -v 2`
  - 結果:
    `Ran 34 tests ... OK`

## Overall Assessment
現状は **「構造としてはクリーンアーキテクチャ準拠」** です。  
一方で、`get_container()` 中心の Service Locator パターンが残っているため、厳密には **依存注入の明示性が不足** しています。  
優先度としては、まず Service Locator の縮小から着手するのが効果的です。
