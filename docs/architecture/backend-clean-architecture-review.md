# バックエンド Clean Architecture レビュー

実施日: 2026-03-06  
対象: `backend/app`

## 判定
**概ねクリーンアーキテクチャになっています。**  
`domain / use_cases / infrastructure / presentation / entrypoints` の責務分離は明確で、境界違反を検知するテストも整備されています。

## Findings（重要度順）

### 1. Medium: infrastructure が entrypoints に依存している（依存方向のにじみ）
- 根拠:
  - `infrastructure` のタスクゲートウェイ実装が `entrypoints` 配下の定数を import  
    - `backend/app/infrastructure/tasks/task_gateway.py:8`
  - 参照先の定数は `entrypoints` 層に配置  
    - `backend/app/entrypoints/tasks/task_names.py:1`
- 影響:
  - infrastructure 実装が外側の entrypoints 層に結びつき、将来の入口（Celery以外）追加時に再利用性が下がる。
  - 現在の import ルールではこの方向違反を検知できないため、再発防止が弱い。
- 提案:
  - タスク名定数を中立な契約モジュール（例: `app/contracts/tasks.py`）へ移し、entrypoints/infrastructure から参照する。
  - import ルールに `infrastructure -> app.entrypoints` 禁止を追加する（必要な例外は最小化）。

### 2. Low: `dependencies` が集約 `composition_root` 全体を参照し、文脈分離を弱める
- 根拠:
  - 例: video 用 dependency provider が `from app import composition_root` を参照  
    - `backend/app/dependencies/video.py:3`
  - `composition_root` パッケージは auth/chat/media/video を一括 import  
    - `backend/app/composition_root/__init__.py:10`
- 影響:
  - video 文脈の読み込みが auth/chat の wiring 変更に巻き込まれやすくなる。
  - 文脈単位の独立性（変更影響範囲）が実運用で広がる可能性がある。
- 提案:
  - `dependencies/video.py` は `app.composition_root.video` を直接 import する形に限定し、文脈ごとの依存を局所化する。

## 良い点
- 境界検証テストが充実している。  
  - 実行: `docker compose exec backend python manage.py test app.tests.test_import_rules -v 2 --keepdb`
  - 結果: **34 tests, all pass**
- ルールは「ドメインのフレームワーク非依存」「use_case の文脈分離」「presentation の ORM/infra 直参照禁止」をカバーしている。  
  - `backend/app/tests/test_import_rules.py`
- use_cases のユニットテストが in-memory fake ベースで、層の純度を保っている。  
  - `backend/app/use_cases/video/tests/test_create_video.py:1`

## 結論
現状は **「クリーンアーキテクチャとして実用的に成立している」** 状態です。  
上記2点（特に `infrastructure -> entrypoints` 依存）を解消すると、依存方向の一貫性と将来の拡張性がさらに高まります。
