# バックエンド Clean Architecture レビュー

実施日: 2026-03-06  
対象: `backend/app`

## 総評
現状は **概ねクリーンアーキテクチャに沿っています**。  
`domain / use_cases / infrastructure / presentation` の分離は明確で、境界チェックテストも通過しています。

ただし、以下の点は「境界の意図を弱める」ため、改善余地があります。

## Findings（重要度順）

### 1. Medium: Celery タスクの公開名が presentation 境界に固定されている
- 根拠:
  - `app/tasks/task_names.py` でタスク名が `app.presentation.tasks.*` 固定  
  - `app/entrypoints/tasks/*.py` の `@shared_task(name=...)` も同じ文字列を使用  
  - `app/celery_config.py` で `app.autodiscover_tasks(["app.presentation"])`
- 影響:
  - 実体を `entrypoints` に移した後も、外部契約が presentation 名に固定され、境界の移行/整理が難しくなる。
  - 将来のリネーム時に後方互換対応が増える。
- 提案:
  - 正式な公開名を `app.entrypoints.tasks.*` に寄せ、互換期間のみ alias を残す。
  - `autodiscover_tasks` も `app.entrypoints` 側を主にする。

### 2. Medium: タスク起点が `entrypoints` と `presentation` で二重化され、境界責務が曖昧
- 根拠:
  - `app/presentation/tasks/*.py` は wrapper として `app.entrypoints.tasks.*` を再エクスポート
  - ただし `app/presentation/tasks/__init__.py` は依然として「task entrypoints」として公開
  - `app/admin.py` からも `app.presentation.tasks.reindexing` を直接 import
- 影響:
  - 「非HTTPエントリポイントはどこか」がコード上で一意にならず、新規実装時に誤配置しやすい。
- 提案:
  - タスク起点は `entrypoints/tasks` に一本化し、`presentation/tasks` は段階的に削除。
  - `admin.py` の import 先を `entrypoints.tasks` に切り替える。

### 3. Low: use_cases 層のテストが Django ORM / infrastructure に依存している
- 根拠:
  - `app/use_cases/video/tests/test_create_video.py` で `DjangoVideoRepository` と `app.models.Video` を直接使用
- 影響:
  - use_cases の純粋ユニットテストにならず、層の独立性を検証しにくい。
  - テスト速度や失敗原因の切り分けが悪化しやすい。
- 提案:
  - use_cases の基本ケースは in-memory fake repository / fake gateway で検証。
  - ORM を使う検証は integration テストとして分離。

## 良い点
- `app/tests/test_import_rules.py` による境界検証が充実しており、主要な禁止依存が自動検出される。
- `composition_root` と `dependencies` で依存解決が集約されている。
- `domain` 層は Django/DRF 非依存で保たれている。

## 結論
**「はい、概ねクリーンアーキテクチャになっています」**。  
一方で、Celery タスクまわりの境界整理（`presentation` 依存名の解消）と、use_cases テストの純化を進めると、設計の一貫性がさらに高まります。
