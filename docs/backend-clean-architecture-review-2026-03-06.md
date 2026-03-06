# バックエンド Clean Architecture レビュー（2026-03-06）

## 結論
- 現状のバックエンドは **概ね Clean Architecture に沿っています**（レイヤ分離・依存方向・DIの骨格は良好）。
- ただし、境界契約と責務配置に関して、将来の劣化につながる懸念が3点あります。

## 主要な指摘（重要度順）

### 1. `ValueError` に依存した境界契約が残っている（Medium）
- 根拠:
  - `AddVideoToGroupUseCase` / `RemoveVideoFromGroupUseCase` が `ValueError` を契約として扱っている  
    `backend/app/use_cases/video/manage_groups.py:28`  
    `backend/app/use_cases/video/manage_groups.py:80`
  - `AddVideosToGroupUseCase` が repository 由来の `ValueError` を `ResourceNotFound` に変換  
    `backend/app/use_cases/video/manage_groups.py:61`  
    `backend/app/use_cases/video/manage_groups.py:63`
  - タグ操作でも同様  
    `backend/app/use_cases/video/manage_tags.py:34`  
    `backend/app/use_cases/video/manage_tags.py:36`  
    `backend/app/use_cases/video/manage_tags.py:62`  
    `backend/app/use_cases/video/manage_tags.py:64`
- リスク:
  - 例外意味論が暗黙化し、use case と adapter の結合が強まる。
  - 実装差し替え時に、同じ `ValueError` でも意味が変わる可能性がある。
- 推奨:
  - domain/use_case 層で明示的な業務例外（例: `AlreadyInGroup`, `TagNotAttached`）を定義し、port 契約として固定する。

### 2. Presentation 層に複数 UseCase のオーケストレーションが残っている（Medium）
- 根拠:
  - グループ作成後に、view が追加で detail use case を呼び直している  
    `backend/app/presentation/video/views.py:221`  
    `backend/app/presentation/video/views.py:224`
  - その再取得失敗を握りつぶして処理継続している  
    `backend/app/presentation/video/views.py:225`  
    `backend/app/presentation/video/views.py:226`
  - 更新時も同様に view 側で再取得フローを保持  
    `backend/app/presentation/video/views.py:277`  
    `backend/app/presentation/video/views.py:280`
- リスク:
  - HTTPアダプタが「入力/出力変換」に留まらず、アプリケーションフロー知識を持ち始める。
  - 振る舞い変更時に同種ロジックが複数 view に分散しやすい。
- 推奨:
  - 「作成/更新して詳細DTOを返す」ユースケースに統合し、presentation は単一 use case 呼び出しに寄せる。

### 3. import ガードは強いが、監視対象レイヤが限定されている（Low）
- 根拠:
  - ルール説明・検査対象が `domain/use_cases/presentation/infrastructure` 中心  
    `backend/app/tests/test_import_rules.py:4`  
    `backend/app/tests/test_import_rules.py:200`
  - スキャン件数チェックも上記4レイヤのみ  
    `backend/app/tests/test_import_rules.py:201`  
    `backend/app/tests/test_import_rules.py:205`
- リスク:
  - `dependencies` / `composition_root` / `entrypoints` で依存逆流が起きても、現在のガードでは検出しづらい。
- 推奨:
  - 外側レイヤ向けの軽量ルールを追加（例: `entrypoints -> use_cases/dependencies only`）。

## 良い点（確認できた事項）
- `domain` / `use_cases` は Django / DRF / ORM 依存を直接持っていない（静的走査で確認）。
- `presentation` から `infrastructure` 直接依存を避け、`app.dependencies` 経由でDIしている。
- `composition_root` が具体実装を束ね、use case への注入ポイントとして機能している。

## 実行確認メモ
- 実環境テストはこのワークスペースでは未実施（依存不足）。
  - `python -m pytest app/tests/test_import_rules.py -q` -> `No module named pytest`
  - `python manage.py test app.tests.test_import_rules -v 2` -> `No module named django`

