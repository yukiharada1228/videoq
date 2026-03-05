# Clean Architecture Review

対象: `videoq/backend`  
レビュー日: 2026-03-05

## 結論

このコードベースは**レイヤ分割自体は概ねできている**ものの、厳密なクリーンアーキテクチャとしては**部分的に未達**です。  
特に「ルール検証の抜け道」と「UseCase/Domainへの配信表現（HTTP向けデータ形）の混入」が課題です。

## Findings (重要度順)

### 1. High: 依存ルール検証が誤検知を見逃す実装になっている

- 根拠:
  - `app/tests/test_import_rules.py` の `check_forbidden_imports` は `SyntaxError` 時に `[]` を返しており、違反を検知できないまま通過する
  - 同ファイルの `ImportFrom` 判定は `from app import models` のような形式を禁止パターン `app.models` で捕捉できない
- 参照:
  - `app/tests/test_import_rules.py:35-36`
  - `app/tests/test_import_rules.py:40-47`
- 影響:
  - CI上で「レイヤ違反ゼロ」に見えても、実際は違反が混入する可能性がある

### 2. Medium: UseCaseの出力がHTTPレスポンス形状に近い辞書へ寄っている

- 根拠:
  - `GetPopularScenesUseCase` が `List[dict]` を返し、`"file"`, `"reference_count"`, `"questions"` などレスポンス向けキーを直接構築
  - `GetChatAnalyticsUseCase` も `dict` を返し、`summary/scene_distribution/time_series/...` の出力整形をUseCaseで実施
- 参照:
  - `app/use_cases/chat/get_popular_scenes.py:32`
  - `app/use_cases/chat/get_popular_scenes.py:57-67`
  - `app/use_cases/chat/get_analytics.py:24`
  - `app/use_cases/chat/get_analytics.py:65-74`
- 影響:
  - プレゼンテーション都合の変更がUseCaseへ波及しやすくなる
  - 「業務ルール」と「返却フォーマット」の境界が曖昧になる

### 3. Medium: Domain契約に配信/フレームワーク寄り情報が含まれる

- 根拠:
  - `VideoEntity` が `file_url` を持つ（URLは配信・ストレージ解決側の関心）
  - `VideoRepository` が `get_file_urls_for_ids` を公開している
  - `CreateVideoInput.file` が `Any`（コメント上は Django `InMemoryUploadedFile` を想定）
- 参照:
  - `app/domain/video/entities.py:39`
  - `app/domain/video/repositories.py:68-71`
  - `app/use_cases/video/dto.py:16`
  - 実装側の対応箇所: `app/infrastructure/repositories/django_video_repository.py:52-57`
- 影響:
  - Domain/UseCase が外側（HTTP/Storage）都合に引っ張られやすい
  - 将来の配信方式変更時に内側レイヤ修正が必要になりやすい

## 良い点

- `domain/use_cases/presentation/infrastructure` の物理分離は明確
- `factories.py` + `container.py` による Composition Root / DI 方向は妥当
- `tasks` が `container` 経由でUseCaseへ委譲する方針は概ね守れている

## 総評

- 判定: **「クリーンアーキテクチャ風の構成はできているが、厳密運用はまだ」**
- 優先改善順:
  1. `test_import_rules.py` の検証強化（見逃し防止）
  2. UseCase出力をDTO化して、レスポンス整形をPresentationへ寄せる
  3. Domain契約から `file_url` 等の配信寄り概念を切り離す

## 補足（今回のレビュー制約）

- ローカル実行環境に `pytest` がないため、ホスト直実行は未実施。

## テスト実行結果（Docker）

- 実行日: 2026-03-05
- 実行コマンド: `docker compose -f ../docker-compose.yml exec backend python manage.py test --keepdb --noinput`
- 結果: `Ran 516 tests in 63.176s` / `OK`
- 備考: 既存の `test_postgres` があるため、`--keepdb --noinput` で非対話実行
