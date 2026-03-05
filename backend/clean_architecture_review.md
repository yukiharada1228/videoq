# Clean Architecture Review (backend)

## 結論
このバックエンドは**クリーンアーキテクチャを意識した構造になっているが、完全には徹底できていない**です。

- 良い点: `domain / use_cases / infrastructure / presentation` の分割と、Repository/Gateway抽象の導入はできています。
- 課題: 一部でレイヤ境界をまたぐ実装があり、将来的に依存方向が崩れやすい状態です。

## 主要な指摘（重大度順）

### 1. High: Presentation層で直接ORMを実行しており、UseCase経由の一貫性が崩れている
- 対象: `app/presentation/auth/views.py`
- 根拠: `MeView.get_object()` が `User.objects.annotate(...).get(...)` を直接実行しています（`302-313`行）。
- 影響: エンドポイントごとにデータアクセス方針が分散し、ユースケース層に集約すべきアプリケーションルールが漏れます。
- 推奨: `GetCurrentUserUseCase` のようなUseCaseを追加し、ORMアクセスはRepository/Gatewayへ移す。

### 2. High: CeleryタスクがUseCaseを介さずにモデル/外部連携を直接操作している
- 対象: `app/tasks/transcription.py`, `app/tasks/account_deletion.py`, `app/tasks/reindexing.py`
- 根拠:
  - `transcription.py` で状態更新・外部API呼び出し・インデックス作成までを直接オーケストレーション（`57-59`, `98-143`行）。
  - `account_deletion.py` で `app.models` を直接操作（`10`, `16-36`行）。
  - `reindexing.py` で `Video.objects` と `delete_all_vectors()` を直接操作（`9`, `27-58`行）。
- 影響: ビジネスルールが `use_cases` 外にも分散し、変更時の影響範囲が読みづらくなります。
- 推奨: タスクは「トリガー」に限定し、実処理は `use_cases` に寄せる（タスクからUseCaseを呼ぶ形へ）。

### 3. Medium: VideoユースケースがAuthドメインのGatewayに依存しており、コンテキスト境界が曖昧
- 対象: `app/use_cases/video/create_video.py`, `app/domain/auth/gateways.py`
- 根拠:
  - `CreateVideoUseCase` が `app.domain.auth.gateways.TaskQueueGateway` を参照（`7`, `22`行）。
  - `TaskQueueGateway` は `enqueue_transcription` と `enqueue_account_deletion` を同一インターフェースに持つ（`10-20`行）。
- 影響: Video/Authの関心が1つのポートに混在し、将来的な分割や差し替えが難しくなります。
- 推奨: `domain.shared` か各コンテキスト配下へGatewayを分離（例: `VideoTaskGateway`, `AccountDeletionTaskGateway`）。

### 4. Medium: importルールの自動検査範囲が限定的で、境界逸脱を取りこぼす可能性がある
- 対象: `app/tests/test_import_rules.py`
- 根拠:
  - 検査対象は `domain/use_cases/presentation` 配下中心（`76-91`行）。
  - `tests` ディレクトリは除外（`22-24`行）。
  - `tasks`, `utils`, `factories` などはこのテストで境界検査されません。
- 影響: 現在起きている `tasks` 側の層またぎのような問題をCIで自動検知できません。
- 推奨: `tasks` を明示的にインフラ層として検査対象に加えるか、別ルールを追加する。

## 良い点（維持推奨）
- `domain` で抽象（Repository/Gateway）を定義し、`infrastructure` で実装する形は明確。
- `presentation` から `app.models` / `app.infrastructure` への直接依存を禁止するテスト方針自体は有効。
- `app/factories.py` をDIの組み立て点にしているため、依存生成箇所が集約されている。

## 総評
現状は「**クリーンアーキテクチャ準拠を目指した実装**」です。  
ただし、`presentation` の一部直接ORMアクセスと、`tasks` 側のUseCase迂回があるため、厳密には「クリーンアーキテクチャになっている」と断言はできません。

## 検証メモ
`docker compose exec` でコンテナ内テストを実行しました。

- `docker compose exec backend python -m unittest discover -s app/tests -p 'test_import_rules.py' -v` → `OK (4 tests)`
- `docker compose exec backend python -m unittest discover -s app/tests -p 'test_*.py' -v` → `OK (4 tests)`
- 補足: `docker compose exec backend python manage.py test app.tests.test_import_rules -v 2` は `app/tests.py` と `app/tests/` の名前衝突により失敗（`module 'app.tests' has no attribute 'test_import_rules'`）。
