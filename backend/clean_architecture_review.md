# Clean Architecture Review (Backend)

Date: 2026-03-05
Scope: `app/domain`, `app/use_cases`, `app/infrastructure`, `app/presentation`, `app/tasks`

## Conclusion
全体としてはレイヤ分割と依存方向の意図が明確で、**クリーンアーキテクチャに近い構成**です。  
ただし、いくつかの箇所で「型/契約のにじみ」と「ガードレール運用面の弱さ」があり、厳密には「部分的に達成」という判定です。

## Findings (Severity order)

### 1. Medium: ドメイン/ユースケース契約に `validated_data`・`dict` が露出し、境界の型安全性が弱い
- 根拠:
  - `app/domain/video/repositories.py:40`
  - `app/domain/video/repositories.py:45`
  - `app/domain/video/repositories.py:108`
  - `app/domain/video/repositories.py:113`
  - `app/domain/video/repositories.py:181`
  - `app/domain/video/repositories.py:186`
  - `app/use_cases/video/create_video.py:26`
  - `app/use_cases/video/create_video.py:31`
- 問題:
  - ドメインポートの引数が `validated_data: dict` になっており、DRFの入力概念が暗黙に内部契約へ入り込んでいます。
  - コンパイル時に契約不整合を検出しにくく、キー typo や項目追加時の破壊的変更が実行時まで見えません。
- 影響:
  - ユースケースとインフラの結合度上昇、変更耐性低下。
- 改善案:
  - `CreateVideoInput` / `UpdateVideoInput` などの入力DTOを `use_cases` 側で定義し、リポジトリ契約をDTO基準にする。

### 2. Medium: Chat集計フローが永続化由来の生 `dict` 形式に依存している
- 根拠:
  - `app/domain/chat/repositories.py:55`
  - `app/domain/chat/repositories.py:33`
  - `app/domain/chat/entities.py:53`
  - `app/domain/chat/entities.py:73`
  - `app/domain/chat/entities.py:74`
  - `app/domain/chat/services.py:25`
  - `app/domain/chat/services.py:26`
  - `app/domain/chat/services.py:31`
  - `app/use_cases/chat/get_analytics.py:49`
- 問題:
  - ドメインサービス `aggregate_scenes` が `log.get("related_videos")` のような辞書キーに直接依存しています。
  - リポジトリ出力スキーマ変更（キー名変更、型変更）時に、ドメインロジックが静的に保護されません。
- 影響:
  - ドメインロジックの可読性・再利用性・テスト容易性が低下。
- 改善案:
  - `SceneReference` や `ChatSceneLog` の明示的Value Objectを導入し、辞書アクセスをインフラ側mapperに閉じ込める。

### 3. Low: アーキテクチャ制約テストの実行経路が紛らわしい
- 根拠:
  - 制約テスト本体: `app/tests/test_import_rules.py:1`
  - 同名モジュールを解決しうるファイル: `app/tests.py:1`
  - 実測: `python -m unittest app.tests.test_import_rules -v` は import 解決エラー、`python app/tests/test_import_rules.py` は成功
- 問題:
  - テストランナーや呼び出し方によって、重要な境界ガードが実行されない可能性があります。
- 影響:
  - CI設定次第でレイヤ違反を見逃す運用リスク。
- 改善案:
  - テスト実行コマンドをCIで固定する（例: `pytest app/tests/test_import_rules.py`）。
  - もしくは `app/tests.py` と競合しない配置・命名へ整理する。

### 4. Low: `factories` が実質サービスロケータ化しており、依存差し替えの明示性が弱い
- 根拠:
  - `app/factories.py:6`
  - `app/factories.py:29`
  - `app/presentation/video/views.py:15`
  - `app/presentation/chat/views.py:15`
  - `app/tasks/transcription.py:10`
- 問題:
  - プレゼンテーション/タスク層がグローバル関数経由で依存解決しており、ユースケース生成の差し替えポイントが暗黙的です。
- 影響:
  - コンポジションルートのテスト差し替え、環境別DI戦略（本番/テスト）を拡張しづらい。
- 改善案:
  - `factories` を明示DIコンテナ（または provider object）に寄せ、依存解決をインスタンス化可能にする。

## Strengths
- レイヤ構成が明確（`domain` / `use_cases` / `infrastructure` / `presentation`）。
- `app/tests/test_import_rules.py` で依存方向ルールを静的検証している。
- `presentation` は概ね thin adapter として実装され、ユースケースへの委譲ができている。
- `tasks` がユースケース呼び出しに寄せられており、処理本体の肥大化を抑えている。

## Overall judgement
- 判定: **Partially Yes（概ね準拠、ただし改善余地あり）**
- 優先対応:
  1. `dict` ベース契約のDTO化
  2. Chat集計系のValue Object化
  3. import ruleテストのCI実行保証

## Test execution (Docker Compose)
- 実行日: 2026-03-05
- 実行環境: `docker compose` の `backend` コンテナ
- 実行コマンド:
  - `docker compose -f ../docker-compose.yml exec backend python -m unittest discover -s app/tests -p 'test_import_rules.py' -v`
- 結果:
  - `Ran 4 tests in 0.002s`
  - `OK`
- 補足:
  - `docker compose ... exec backend pytest ...` はコンテナ内に `pytest` が存在せず失敗（`exec: "pytest": executable file not found in $PATH`）。
  - そのため `python -m unittest` で同等テストを実施し、成功を確認。
