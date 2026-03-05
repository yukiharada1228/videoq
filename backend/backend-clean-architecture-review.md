# Backend Clean Architecture Review

- Date: 2026-03-06
- Scope: `backend/app` (domain / use_cases / presentation / infrastructure / tasks / factories / container)
- Reviewer: Codex

## Executive Summary

結論として、**現状のバックエンドは「概ねクリーンアーキテクチャに沿っている」** と判断しました。  
特に、レイヤー間の禁止依存をテストで継続検証している点は強いです。

一方で、`app.utils` を横断的に利用する構造が一部に残っており、将来的な依存方向の劣化リスクがあります。

## Evidence Checked

1. 依存ルールの自動テスト
   - `python -m unittest app.tests.test_import_rules -v` を実行し、**31 tests all green** を確認
   - ルール定義: `domain/use_cases/presentation/infrastructure/tasks/utils` の禁止 import が明文化  
     参照: [backend/app/tests/test_import_rules.py](/Users/yukiharada/dev/videoq/backend/app/tests/test_import_rules.py:143)
2. DI/Composition root 構造
   - Presentation から `get_container()` 経由で use case を解決  
     参照: [backend/app/container.py](/Users/yukiharada/dev/videoq/backend/app/container.py:19), [backend/app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py:16)
3. Domain Port / Infrastructure Adapter の対応
   - Port: [backend/app/domain/video/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/repositories.py)
   - Adapter: [backend/app/infrastructure/repositories/django_video_repository.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_video_repository.py)

## Findings (Severity Order)

### Medium

1. `app.utils` が実質的な横断レイヤーになっており、境界の意味が曖昧
   - `presentation` が `app.utils` に依存  
     参照: [backend/app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py:26)
   - `infrastructure` も `app.utils` に依存  
     参照: [backend/app/infrastructure/external/transcription_gateway.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/transcription_gateway.py:28), [backend/app/infrastructure/repositories/django_user_auth_gateway.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_user_auth_gateway.py:73)
   - 依存ルール上 `utils` は下位レイヤーとして扱われるため、ここにフレームワーク都合のコードが集まると、Clean Architecture の「境界の明確さ」が崩れやすい

### Low

1. Chat Port が `Dict` ベースで境界契約を持っており、型安全性が弱い
   - `messages: List[Dict]`, `related_videos: Optional[List[Dict]]`  
     参照: [backend/app/domain/chat/gateways.py](/Users/yukiharada/dev/videoq/backend/app/domain/chat/gateways.py:25)
   - 仕様変更時に adapter/use_case 間で契約不一致が起きても静的に検出しにくい

## Overall Assessment

- 判定: **Yes (with caveats)**  
- 理由: 依存方向はテストで強く守られており、Domain/UseCase から Django/DRF への直接依存も抑制されている。  
- ただし、`utils` の扱いを明確化しないと、中長期で境界侵食が起きる可能性がある。

## Recommended Next Actions

1. `app.utils` の責務を分割し、`presentation/common` または `infrastructure/common` へ段階移行する
2. `domain/chat/gateways.py` の `Dict` 契約を Value Object / DTO へ置換する
3. `test_import_rules.py` に `presentation -> app.utils.decorators` などの追加禁止ルールを検討する（移行完了後）

