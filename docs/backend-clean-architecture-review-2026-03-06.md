# バックエンド Clean Architecture レビュー (2026-03-06)

## 結論
- `app/domain` / `app/use_cases` / `app/infrastructure` / `app/presentation` の層分離は概ねできています。
- ただし、**厳密な Clean Architecture としては未完成**です。特に DI/Composition Root の集中管理と、ドメインモデルの振る舞い集約に改善余地があります。

## Findings (重大度順)

### 1. [Medium] Composition Root が分散しており、実質 Service Locator に近い
- `presentation -> dependencies -> factories` の経路で都度インスタンス生成しており、依存解決がアプリ全体で分散しています。
- これにより、依存グラフの可視性低下・差し替え難易度上昇・設定ミス検出の遅延が起きやすいです。
- 参照:
  - [backend/app/dependencies/video.py](/Users/yukiharada/dev/videoq/backend/app/dependencies/video.py:1)
  - [backend/app/dependencies/auth.py](/Users/yukiharada/dev/videoq/backend/app/dependencies/auth.py:1)
  - [backend/app/factories/video.py](/Users/yukiharada/dev/videoq/backend/app/factories/video.py:1)
  - [backend/app/factories/__init__.py](/Users/yukiharada/dev/videoq/backend/app/factories/__init__.py:1)

### 2. [Low] ドメインが貧血モデル寄り（データ構造中心）で、ルールがユースケース/リポジトリ側に寄っている
- `domain` の Entity はほぼ dataclass の状態保持に留まり、業務不変条件や振る舞いが中心化されていません。
- 現状でも動作はしますが、ルール追加時にユースケースへ条件分岐が増えやすく、ドメインの保守性が下がるリスクがあります。
- 参照:
  - [backend/app/domain/video/entities.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/entities.py:1)
  - [backend/app/domain/chat/entities.py](/Users/yukiharada/dev/videoq/backend/app/domain/chat/entities.py:1)
  - [backend/app/use_cases/video/create_video.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/create_video.py:1)

### 3. [Low] `presentation` 配下に Celery タスク入口があり、責務の意味づけが曖昧
- `presentation/tasks` は HTTP ではない非同期入口（Celery）を担っており、層の命名と責務の対応がやや不明瞭です。
- 依存方向自体は大きく崩れていませんが、将来的に「presentation に何を置くか」の判断がぶれやすくなります。
- 参照:
  - [backend/app/presentation/tasks/transcription.py](/Users/yukiharada/dev/videoq/backend/app/presentation/tasks/transcription.py:1)
  - [backend/app/presentation/tasks/reindexing.py](/Users/yukiharada/dev/videoq/backend/app/presentation/tasks/reindexing.py:1)
  - [backend/app/presentation/tasks/account_deletion.py](/Users/yukiharada/dev/videoq/backend/app/presentation/tasks/account_deletion.py:1)

## 良い点
- 層ごとの import 制約をテストで検証しており、アーキテクチャ劣化を防ぐ仕組みがあります。
  - [backend/app/tests/test_import_rules.py](/Users/yukiharada/dev/videoq/backend/app/tests/test_import_rules.py:1)
- `use_cases` は `domain` の Port/Repository 抽象に依存しており、`infrastructure` への直接依存が避けられています。
- `infrastructure` 側で ORM モデルを Domain Entity にマップしており、内側への Django 侵入を抑えています。

## 判定
- 判定: **Mostly Yes (7/10)**
- 理由:
  - 依存方向と層分離は全体として良好
  - 一方で、DI/Composition Root の集中化とドメイン振る舞いの集約が弱く、厳密な Clean Architecture には届いていない

## 改善優先度 (推奨)
1. Composition Root を1箇所に集約（コンテナ化または明示的ワイヤリング関数）
2. ルールの一部を Entity/Domain Service に移し、ユースケースの条件分岐を縮小
3. `presentation/tasks` を `entrypoints/tasks` などへ再配置して責務を明確化
