# Backend Clean Architecture Review

Date: 2026-03-06
Scope: `backend/app` (domain/use_cases/presentation/infrastructure/composition_root/dependencies)

## Findings (ordered by severity)

### 1. [Medium] Auth presentation uses implicit service-locator style instead of explicit dependency injection
- `auth` だけが `as_view(...use_case=...)` 注入を使わず、ビュー内部で `auth_dependencies.get_*_use_case()` を直接呼んでいます。
- References:
  - `backend/app/presentation/auth/urls.py:19` (all auth views are plain `as_view()`)
  - `backend/app/presentation/auth/views.py:61`
  - `backend/app/presentation/auth/views.py:95`
  - `backend/app/presentation/auth/views.py:169`
  - `backend/app/presentation/auth/views.py:201`
- Impact:
  - 依存が URL 配線で可視化されず、テスト時の差し替え粒度が粗くなります。
  - `video/chat` が採用している明示 DI スタイルと不整合で、境界ルールが運用で崩れやすくなります。
- Suggestion:
  - `video/chat` と同様に `as_view(...)` で use case factory を注入し、`DependencyResolverMixin` 経由で解決する形に統一する。

### 2. [Low] Chat use case has direct cross-context dependency on video domain ports
- `GetPopularScenesUseCase` は `chat` コンテキストの use case から `video` ドメインの `VideoRepository` と `FileUrlResolver` に直接依存しています。
- Reference:
  - `backend/app/use_cases/chat/get_popular_scenes.py:9`
  - `backend/app/use_cases/chat/get_popular_scenes.py:10`
  - `backend/app/use_cases/chat/get_popular_scenes.py:65`
- Impact:
  - 現状はポート依存なので技術的には許容できますが、`video` 側ポート変更が `chat` ユースケースに波及しやすいです。
- Suggestion:
  - 将来的に境界をさらに強くしたい場合、`chat` 側に専用ポート（例: `SceneVideoInfoProvider`）を切って anti-corruption 層を置く。

## What is good
- レイヤ分割自体は明確です: `domain`, `use_cases`, `presentation`, `infrastructure`, `composition_root`, `dependencies`。
- 依存方向を守るための自動チェックが強く実装されています。
  - `backend/app/tests/test_import_rules.py:193`
  - `backend/app/tests/test_import_rules.py:215`
  - `backend/app/tests/test_import_rules.py:227`
- `use_cases`/`domain` では Django 型への直接依存を避け、Protocol/DTO で境界を表現できています。
  - `backend/app/use_cases/video/dto.py:15`
  - `backend/app/domain/video/repositories.py:1`
- ORM 依存は `infrastructure` に隔離されています。
  - `backend/app/infrastructure/repositories/django_video_repository.py:8`
  - `backend/app/infrastructure/repositories/django_video_repository.py:32`

## Verdict
- 結論として、バックエンドは **概ねクリーンアーキテクチャに沿っています**。
- ただし、`auth` の DI スタイル不統一と `chat -> video` の境界設計は、今後の保守性に対する軽度のリスクです。

## Validation limits
- `python manage.py test app.tests.test_import_rules -v 2` を実行しようとしましたが、ローカル環境に Django が未インストールで実行できませんでした。
- そのため本レビューは、コード静的読解ベースです。
