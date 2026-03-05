# バックエンドのクリーンアーキテクチャレビュー

作成日: 2026-03-05
対象: `/Users/yukiharada/dev/videoq/backend`

## 結論
全体としては **「クリーンアーキテクチャに寄せた構成」** です。`domain/use_cases/infrastructure/presentation` の分割、Repository/Gatewayの抽象化、composition root (`app/factories.py`) はできています。

一方で、**境界を一部横断する実装が残っているため、厳密には未達** です。特に `presentation` から `infrastructure` への直接依存、`use_cases` への Django User オブジェクト持ち込み、`auth` 系の業務処理が `serializer` に集中している点が課題です。

## Findings（重大度順）

### 1. High: use case が Django User（フレームワーク依存オブジェクト）を直接受け取っている
- 根拠:
  - `CreateVideoUseCase.execute(self, user, ...)` が「authenticated Django user」を引数に取る
    - `app/use_cases/video/create_video.py:26-30`
  - `AccountDeletionUseCase.execute(self, user, ...)` も同様
    - `app/use_cases/auth/delete_account.py:29`
  - Gateway契約でも ORM model 前提が明示されている
    - `app/domain/auth/gateways.py:32-39`
- 問題:
  - ユースケース層がフレームワークの型/属性に暗黙依存し、アプリケーションルールの独立性とテスト容易性を下げる。
- 推奨:
  - use case 入力を `user_id`, `video_limit` などのプリミティブ/DTOへ変更。
  - `AccountDeletionGateway.deactivate_user` も `user_id` ベースで扱う契約に寄せる。

### 2. High: auth の主要フローが use case 層を経由せず presentation(serializer) に実装されている
- 根拠:
  - `UserSignupSerializer` がユーザー作成とメール送信を実行
    - `app/presentation/auth/serializers.py:50-71`
  - `EmailVerificationSerializer` がトークン検証と有効化を実行
    - `app/presentation/auth/serializers.py:130-151`
  - `PasswordReset*Serializer` が検索・検証・更新を実行
    - `app/presentation/auth/serializers.py:154-168`, `171-...`
- 問題:
  - ビジネスロジックが入出力アダプタ層に偏在し、責務分離が不均一（video/chatと比較して層の一貫性がない）。
- 推奨:
  - signup / verify / password reset を use case 化し、serializer は入力検証とDTO変換に限定。

### 3. Medium: presentation が infrastructure 実装へ直接依存している箇所がある
- 根拠:
  - `ChatView` 内で `app.infrastructure.external.llm` を直接 import
    - `app/presentation/chat/views.py:66`
- 問題:
  - 本来は composition root 経由で差し替えるべき依存が controller に入り、テストや置換性が落ちる。
- 推奨:
  - `LLMProviderGateway` などを定義し、`factories` で注入。

### 4. Medium: presentation が repository を直接呼び出している（use case bypass）
- 根拠:
  - `VideoDetailView._get_video` が `factories.get_video_repository().get_by_id(...)` を直接呼ぶ
    - `app/presentation/video/views.py:112-113`
- 問題:
  - ユースケース層を経由しない経路ができ、業務ルール/ポリシーの集約点が崩れる。
- 推奨:
  - `GetVideoDetailUseCase` を作り、参照系も use case に統一。

### 5. Medium: import ルールテストのガード範囲に抜けがある
- 根拠:
  - `presentation` で禁止しているのが `app.models` と `app.infrastructure.repositories` のみ
    - `app/tests/test_import_rules.py:85-89`
  - `app.infrastructure.external` などは禁止対象外。
- 問題:
  - ルール上は「問題なし」でも、実質的な層横断依存を見逃す。
- 推奨:
  - `presentation` の禁止対象を `app.infrastructure` 全体へ拡張（例外が必要なら allowlist 管理）。

## 良い点
- 層構造の分離が明確 (`domain/use_cases/infrastructure/presentation`)。
- domain に抽象Repository/Gatewayを置く設計が徹底されている。
  - 例: `app/domain/video/repositories.py:1-4, 17-64`
- composition root (`app/factories.py`) が存在し、依存注入の中心になっている。
  - `app/factories.py:1-4`
- 境界違反を検知するCIテストを導入済み。
  - `app/tests/test_import_rules.py:1-9`

## 優先対応順
1. use case から Django User 依存を排除（Finding 1）
2. auth フローを use case 化（Finding 2）
3. presentation → infrastructure 直接依存の解消（Finding 3, 4）
4. import ルールテストを拡張（Finding 5）

## 検証メモ
- Docker コンテナ内で実行:
  - `docker compose exec backend python -m unittest discover -s app/tests -p 'test_import_rules.py' -v`
- 実行結果:
  - 4 tests run, all passed (`OK`)
- 補足:
  - `docker compose exec backend python manage.py test app.tests.test_import_rules --verbosity 2` は、`app/tests.py` と `app/tests/` の同名衝突により `module 'app.tests' has no attribute 'test_import_rules'` で失敗。
  - そのため、`unittest discover` で対象ファイルを直接実行して確認。
