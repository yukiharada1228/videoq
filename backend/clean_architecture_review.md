# Clean Architecture Review (backend)

## Findings (severity order)

### 1. High: Infrastructure layer depends on Use Case layer (dependency rule violation)
- `infrastructure` が `use_cases` の例外型に依存しています。
- Clean Architecture の依存方向（外側 -> 内側）としては、`infrastructure` は `domain`（必要なら application port）に依存し、`use_cases` への直接依存は避けるべきです。

Evidence:
- `app/infrastructure/external/llm.py:12` (`from app.use_cases.shared.exceptions import LLMConfigError`)
- `app/infrastructure/external/rag_gateway.py:13` (`from app.use_cases.shared.exceptions import LLMConfigError`)
- `app/infrastructure/auth/simplejwt_gateway.py:12` (`from app.use_cases.auth.exceptions import InvalidToken`)

Risk:
- use case 層の変更が infrastructure 層に波及しやすくなり、レイヤ独立性が低下します。
- 例外の責務境界が曖昧になり、拡張時に循環的な依存が発生しやすくなります。

Recommendation:
- 例外型は `domain` 側（port/gateway 契約）へ寄せるか、`app/common` などの中立レイヤに移動する。
- `use_cases` は domain 例外を必要に応じて変換する。

### 2. Medium: Import rule tests do not guard the above violation
- 依存ルールのテストは `domain/use_cases/presentation/tasks` を中心に制約していますが、`infrastructure -> use_cases` の禁止が含まれていません。

Evidence:
- `app/tests/test_import_rules.py:204-206` は `infrastructure` に対して `rest_framework` のみ禁止
- 同ファイル内に `infrastructure` の `app.use_cases` 依存禁止ルールがない

Risk:
- CI で検知されず、同種の境界違反が増える可能性があります。

Recommendation:
- `infrastructure` で `app.use_cases` を禁止するルールを追加する。
- 可能であれば `app.common` の許可/禁止ポリシーも明文化する。

## Overall assessment
- 結論: **部分的にはクリーンアーキテクチャだが、完全ではない**。
- 良い点:
  - `domain / use_cases / infrastructure / presentation` の層分離は明確。
  - `presentation` が `container` 経由で use case を呼ぶ構成は一貫している。
  - `use_cases` から ORM への直接依存は抑制されている（設計意図は明確）。
- 課題:
  - 本番コードで `infrastructure -> use_cases` 依存があり、依存方向ルールに穴がある。

## Verification notes
- ソースコードの静的レビューと grep ベースで確認。
- `docker compose -f ../docker-compose.yml exec backend python manage.py test app.tests.test_import_rules --verbosity 2` を実行。
- 実行結果: `Ran 8 tests ... OK`（import ルールテストはすべて成功）。
