# クリーンアーキテクチャレビュー（backend）

## 結論
- 現状は **「概ねクリーンアーキテクチャに沿っているが、完全ではない」** です。
- `domain / use_cases / presentation / infrastructure` の分離方針は明確ですが、少なくとも1件、定義済みルールに対する明確な逸脱があります。

## 主要所見（重大度順）

### High
1. `tasks` レイヤの境界違反（ルールと実装の不一致）
   - ルール上、`tasks` は `app.infrastructure` を直接 import してはいけません（`app/tests/test_import_rules.py:132-135`）。
   - しかし `app/tasks/vector_indexing.py:9` で `from app.infrastructure.external.vector_store import PGVectorManager` を直接参照しています。
   - さらに同ファイルはインデックス処理ロジック本体（`index_scenes_to_vectorstore` など）を持っており、`tasks` を「薄いトリガー」に限定する方針ともズレています。

### Medium
1. `use_cases` / `domain` のインターフェースに入力アダプタ（DRF）由来の語彙が混入
   - 例: `app/domain/video/repositories.py:40,45,108,113` の `validated_data: dict`
   - 例: `app/use_cases/video/create_video.py:26,31` で `validated_data` を受け取り、「serializer由来」であることを明記
   - import依存は切れていますが、ユースケースの入力が「ドメインDTO」ではなく「シリアライザ結果dict」に寄っており、入力境界の独立性が弱いです。

2. presentationの一部が「薄いアダプタ」より厚め
   - `app/presentation/chat/views.py` は `ChatRequestSerializer` / `ChatFeedbackRequestSerializer` を schema 用に宣言しつつ、実際には `request.data` を直接読んで手動検証しています（`app/presentation/chat/views.py:60-90,130-151`）。
   - バリデーション責務が view に残っており、エンドポイント増加時に重複・不整合が生じやすい構造です。

## 良い点
- レイヤ依存の禁止ルールがテストとして明文化されている（`app/tests/test_import_rules.py`）。
- `use_cases` は `domain` の repository/gateway 抽象に依存しており、Django ORM 直結になっていない（例: `app/use_cases/video/run_transcription.py`）。
- `factories.py` を composition root として使い、presentation から infrastructure への直接依存を抑えている。

## 優先改善提案
1. `app/tasks/vector_indexing.py` を `infrastructure` 側 gateway 実装へ移し、`tasks` は use case 呼び出しだけにする。
2. `validated_data: dict` ベースをやめ、use case 入力DTO（dataclass など）を導入する。
3. `chat/views.py` の入力検証を serializer に統一し、view では変換と例外マッピングのみ行う。
4. CIで `app.tests.test_import_rules` を必須化し、境界逸脱を自動検出する。

## 検証メモ
- この環境では依存不足のためテスト実行ができませんでした。
  - `python -m pytest -q app/tests/test_import_rules.py` → `No module named pytest`
  - `python manage.py test app.tests.test_import_rules -v 2` → `No module named django`

## docker compose 実行結果（追記）
- 実行日: 2026-03-05
- コマンド:
  - `docker compose exec backend python -m unittest discover -s app/tests -p 'test_import_rules.py' -v`
  - 結果: **4 passed / 0 failed**
- コマンド:
  - `docker compose exec backend python manage.py test --keepdb --noinput -v 2`
  - 結果: **517 tests, 7 failures, 7 errors**
  - 主な失敗領域: `app.presentation.auth.tests.test_serializers`（`Serializer.save()` 時の `NotImplementedError: create() must be implemented.`、および検証期待値不一致）
