# Clean Architecture Review (backend)

## 結論
- **概ねクリーンアーキテクチャに沿っていますが、厳密には未完了**です。
- レイヤー分離の基本構造（`domain` / `use_cases` / `infrastructure` / `presentation`）と、依存方向を守る自動テストは整備されています。
- 一方で、インフラ実装の一部に責務混在があり、境界が将来的に崩れやすい状態です。

## 確認方法
- ソース構造・主要実装（container/factories, presentation, use_cases, infrastructure, tasks）をレビュー。
- `python -m unittest app.tests.test_import_rules` を実行し、依存ルール検査が通ることを確認。
  - 実行結果: `Ran 20 tests ... OK`

## Findings（重大度順）

### 1. High: `TranscriptionGateway` 実装が責務を持ちすぎており、境界が曖昧
- 対象: `app/infrastructure/external/transcription_gateway.py`
- 根拠:
  - `run()` 内で ORM を直接参照（`from app.models import Video` / `Video.objects...`）している。
  - 同時に音声分割・SRT生成ユーティリティ（`app.tasks.audio_processing`, `app.tasks.srt_processing`）も直接呼び出している。
- 影響:
  - 「外部APIゲートウェイ」+「データアクセス」+「処理オーケストレーション」が1クラスに集中。
  - テスト性と置換性が下がり、変更時の波及範囲が大きくなる。
- 参照:
  - `app/infrastructure/external/transcription_gateway.py:21`
  - `app/infrastructure/external/transcription_gateway.py:22`
  - `app/infrastructure/external/transcription_gateway.py:23`
  - `app/infrastructure/external/transcription_gateway.py:31`

### 2. Medium: `tasks` パッケージが「Celeryエントリポイント」と「処理ユーティリティ」で混在
- 対象: `app/tasks/__init__.py`, `app/tasks/audio_processing.py`, `app/tasks/srt_processing.py`
- 根拠:
  - `tasks` はトリガー（Celery task）だけでなく、ffmpeg/OpenAI/SRTロジックも含んでいる。
  - その結果、`infrastructure/external/transcription_gateway.py` が `tasks` ユーティリティへ依存している。
- 影響:
  - パッケージ名と責務の不一致により、アーキテクチャ意図が読み取りづらい。
  - 将来、非同期基盤変更時にユーティリティまで巻き込むリスク。
- 参照:
  - `app/tasks/__init__.py:5`
  - `app/tasks/audio_processing.py:1`
  - `app/tasks/srt_processing.py:1`

### 3. Medium: 依存ルールテストのカバレッジ外に「抜け道」になり得る層がある
- 対象: `app/tests/test_import_rules.py`
- 根拠:
  - ルール検査は主に `domain/use_cases/presentation/infrastructure/tasks` を対象。
  - `app/common`, `app/utils`, `app/container.py`, `app/factories.py` は個別制約が弱く、将来の依存逆流を防ぎにくい。
- 影響:
  - 現時点では問題化していなくても、開発が進むと「便利層」経由で境界が崩れる可能性。
- 参照:
  - `app/tests/test_import_rules.py:126`
  - `app/tests/test_import_rules.py:143`
  - `app/tests/test_import_rules.py:199`
  - `app/tests/test_import_rules.py:248`

## 良い点
- `presentation` から `infrastructure` への直接依存を避ける方針が明確（container経由）。
- `use_cases` は Django/DRF 直接依存を避けている。
- クロスコンテキスト依存（video/chat/auth）の禁止テストがある。

## 推奨アクション（優先順）
1. `WhisperTranscriptionGateway` を分割し、
   - データ取得は `VideoRepository` 側に寄せる
   - 音声/SRT処理は `infrastructure/external/transcription/` 配下の専用サービスへ移す
2. `app/tasks` は Celery task エントリポイントに限定し、処理ユーティリティは別パッケージへ移す
3. `import_rules` を拡張し、`common/utils/factories/container` にも最低限の依存制約を追加する

## 総評
- **現在の判定: 「部分的に達成（Mostly clean）」**
- 実運用上は十分整理されていますが、上記3点を改善すると「厳密なクリーンアーキテクチャ」に近づきます。

## 追加検証（Docker Compose）
- 実行コマンド:
  - `docker compose exec backend python -m unittest app.tests.test_import_rules`
- 実行結果:
  - `Ran 8 tests in 0.002s`
  - `OK`

> 補足: ローカル実行時（`python -m unittest app.tests.test_import_rules`）は 20 tests でしたが、Docker 実行では 8 tests でした。実行対象モジュール差異（コンテナ内コード状態/テスト検出条件差）を確認する価値があります。
