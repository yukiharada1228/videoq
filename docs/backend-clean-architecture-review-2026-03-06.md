# Backend Clean Architecture Review (2026-03-06)

## Scope
- Target: `backend/app`
- Goal: クリーンアーキテクチャ観点で依存方向・境界・運用性をレビュー
- Evidence:
  - 静的確認（層間 import / DI 配線 / 代表実装）
  - テスト実行: `docker compose exec backend python manage.py test app.tests.test_import_rules -v 2 --keepdb`

## Verdict
バックエンドは**概ねクリーンアーキテクチャを満たしています**。  
`domain/use_cases` から `django/infrastructure` への逆依存は確認されず、`composition_root` で依存注入が行われています。

## Findings (Severity順)

### 1. Medium: Chat入力バリデーションがSerializerを実質バイパスしている
- File: `backend/app/presentation/chat/views.py:73`, `backend/app/presentation/chat/views.py:91`, `backend/app/presentation/chat/views.py:95`
- Detail:
  - OpenAPI上は `ChatRequestSerializer` を要求している一方、`post()` 内では `request.data` を直接読み取り、`MessageSerializer` の `role` 制約などを通していません。
  - その結果、プレゼンテーション層の責務（I/O妥当性検証）が弱まり、ユースケース側に不正データが流れ込みやすくなります。
- Recommendation:
  - `ChatRequestSerializer(data=request.data)` を必須化し、`validated_data` から `ChatMessageInput` を生成する。

### 2. Low: 同じ「グループ未検出」でユースケース間の契約が不統一
- File: `backend/app/use_cases/chat/get_history.py:27`, `backend/app/use_cases/chat/export_history.py:35`
- Detail:
  - `GetChatHistoryUseCase` は未検出時に `[]` を返却。
  - `ExportChatHistoryUseCase` は未検出時に `ResourceNotFound` を送出。
  - 同じコンテキストで失敗表現が分かれており、プレゼンテーション層の解釈負担と挙動差を生みます。
- Recommendation:
  - 「未検出は例外」または「未検出は空配列」に統一する。

### 3. Low: ユースケース内ヘルパーの命名・型がORM漏れを連想させる
- File: `backend/app/use_cases/chat/export_history.py:42`
- Detail:
  - `_build_rows(queryset)` は実体として `ChatLogEntity` の列を処理していますが、`queryset` という命名と未型注釈により、ORM依存が紛れ込んでも検知しづらい状態です。
- Recommendation:
  - 例: `_build_rows(logs: list[ChatLogEntity])` など、境界に沿った命名・型注釈へ変更。

## Positive Evidence
- `domain` と `use_cases` の import 方向が内向きに保たれている。
- 依存注入は `composition_root` に集約（例: `backend/app/composition_root/video.py:1`）。
- 境界ルールを自動検証するテストが存在（`backend/app/tests/test_import_rules.py:193` 以降）。
- 上記 import ルールテストは **36件すべて成功**。

## Test Result
- Command:
  - `docker compose exec backend python manage.py test app.tests.test_import_rules -v 2 --keepdb`
- Result:
  - `Ran 36 tests ... OK`

## Summary
- 現状評価: **Clean Architecture準拠（高）**
- 優先対応:
  1. `ChatView` の Serializer 経由バリデーションを徹底
  2. chat系ユースケースの「未検出時契約」を統一
