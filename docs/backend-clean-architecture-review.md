# バックエンド クリーンアーキテクチャレビュー

実施日: 2026-03-06  
対象: `backend/app`（domain / use_cases / presentation / infrastructure / composition_root / dependencies / entrypoints）

## 結論
現状のバックエンドは、**依存方向と責務分離の観点で概ねクリーンアーキテクチャに準拠**しています。  
特に、レイヤー間の不正依存をCIテストで自動検知している点は強いです。  
一方で、以下の改善余地があります。

## Findings（重要度順）

### 1. Medium: 動画ステータス遷移の整合性がインフラ層で迂回可能
- 根拠:
  - ドメインに遷移ルールあり: `backend/app/domain/video/status.py:8-33`
  - ただしインフラ実装は生文字列で直接更新: `backend/app/infrastructure/repositories/django_video_repository.py:263-270`
- リスク:
  - 別ユースケースや将来の改修で `mark_*` が直接呼ばれると、ドメイン遷移ルールを通らず状態不整合が起きる余地がある。
- 改善案:
  - `VideoTranscriptionRepository` 側のAPIを `mark_processing/mark_completed/mark_error` ではなく、`transition_status(video_id, from_status, to_status)` など遷移前提の契約に寄せる。
  - あるいは `VideoStatus` を受け取るポート契約にして文字列更新を隠蔽する。

### 2. Low: ファイルURL解決の責務がプレゼンテーションに重複
- 根拠:
  - `VideoListSerializer.get_file` と `VideoSerializer.get_file` が同等ロジックを重複実装: `backend/app/presentation/video/serializers.py:42-53`, `backend/app/presentation/video/serializers.py:78-89`
  - 既にURL解決ポート実装は存在: `backend/app/infrastructure/external/file_url_resolver.py:1-16`
- リスク:
  - URL解決ルール変更時の修正漏れ（複数箇所差分）と、コンテキストごとのURL仕様不一致。
- 改善案:
  - use_case出力生成時に `FileUrlResolver` を使って `file_url` を確定させる、またはpresentation共通ユーティリティに一本化する。

### 3. Low: `CreateVideoUseCase` がアップロードファイル全読み込みを担う
- 根拠:
  - `input.file.read()` を use case 内で実行: `backend/app/use_cases/video/create_video.py:62-65`
- リスク:
  - アプリケーション層がI/Oバッファリング戦略に引きずられ、巨大ファイル時のメモリ効率が悪化しやすい。
- 改善案:
  - リポジトリポートをストリーム受け取り可能にする、またはチャンク保存責務をインフラへ寄せる。

## 良い点（準拠できている理由）
- レイヤー間の禁止依存が詳細にテスト化されている。
  - 例: `backend/app/tests/test_import_rules.py:1-520`
- DIの委譲構造（`dependencies -> composition_root`）がテストで検証されている。
  - 例: `backend/app/tests/test_di_graph_consistency.py:1-139`
- 実行確認:
  - `python -m unittest app.tests.test_import_rules app.tests.test_di_graph_consistency`
  - 結果: `Ran 60 tests ... OK`

## 総評
- **判定**: 「クリーンアーキテクチャになっているか？」に対しては **Yes（概ね）**。  
- **補足**: 現状は「依存方向の規律」は強い一方、「一部の実装契約（状態遷移・URL解決・I/O責務）」に改善余地があります。
