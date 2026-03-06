# Backend Clean Architectureレビュー（2026-03-06）

## Findings（重大度順）

### 1. [Low] DIエントリポイントが二重化しており、依存解決経路が増えている
- 根拠:
  - `app.dependencies.video` が `app.composition_root` のラッパーを提供: `backend/app/dependencies/video.py:1-99`
  - 同様に `app.factories` も後方互換として同等の公開APIを維持: `backend/app/factories/__init__.py:1-114`
- 影響:
  - DIの入口が複数存在し、将来の変更時に「どちらを正とするか」が曖昧になりやすい。
  - 片方だけ更新される設計ドリフトのリスクがある。
- 提案:
  - `composition_root` + `dependencies/*` に一本化し、`factories` は段階的に廃止（deprecation期間を設ける）。

### 2. [Low] composition root が単一巨大モジュールで、変更衝突と保守コストが上がりやすい
- 根拠:
  - `backend/app/composition_root.py:9-87` で全コンテキストの実装・UseCaseを一括import。
  - 同ファイルで多数の `get_*_use_case` を単一モジュールで管理: `backend/app/composition_root.py:90-220`（以降も継続）。
- 影響:
  - 機能追加時に同一ファイルへの集中変更が発生しやすく、競合・見通し悪化を招く。
- 提案:
  - `composition_root/video.py`, `composition_root/auth.py` のようにコンテキスト分割し、`app/composition_root.py` は再エクスポートのみ行う。

## 総評
- 判定: **概ねクリーンアーキテクチャに沿っている**（重大な境界違反は確認できず）。
- 特に良い点:
  - レイヤ境界をCIテストで明示的に強制している。
    - 例: domain/use_cases/presentation/infrastructure の禁止import規則
      - `backend/app/tests/test_import_rules.py:193-231,275-285`
    - use_cases間のコンテキスト分離
      - `backend/app/tests/test_import_rules.py:254-273`
    - サービスロケータ直呼び出し禁止
      - `backend/app/tests/test_import_rules.py:430-459`

## 実施した確認
- 静的確認:
  - `backend/app/domain` に `django/rest_framework/app.models/app.infrastructure` 依存がないことを検索で確認。
  - `backend/app/use_cases` に `django/rest_framework/app.models/app.infrastructure` 依存がないことを検索で確認。
  - `backend/app/presentation` に `app.models/app.infrastructure` 依存がないことを検索で確認。
- テスト実行:
  - `python -m pytest app/tests/test_import_rules.py -q` は `pytest` 未導入で未実行。
  - `python manage.py test app.tests.test_import_rules -v 2` は `django` 未導入で未実行。

## 制約
- このレビューは、ローカル環境で依存パッケージが未導入のため、**実行確認なしの静的レビュー**。
- CI上で `app/tests/test_import_rules.py` が通過していることを最終的な担保として確認するのが望ましい。
