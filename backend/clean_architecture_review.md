# バックエンドのクリーンアーキテクチャレビュー

## 結論
**部分的にクリーンアーキテクチャになっていますが、完全ではありません。**

- 良い点: `domain / use_cases / infrastructure / presentation` のレイヤー分離があり、禁止インポートをCIテストで検証しています。
- 課題: `auth` まわりでプレゼンテーション層に認証ロジックが残っており、`user` 系はユースケース境界でDjangoモデル依存が漏れています。

## 主要な指摘（重大度順）

### 1. High: Auth の中核ロジックが presentation に残っている
- 根拠:
  - `LoginView` で `RefreshToken.for_user(user)` を直接実行し、トークン発行をViewが担当している。  
    `app/presentation/auth/views.py:90-121`
  - `RefreshView` でも `RefreshToken(...)` の検証とアクセストークン再発行をViewが担当している。  
    `app/presentation/auth/views.py:188-220`
  - `LoginSerializer` が `authenticate(...)` を直接呼んでいる。  
    `app/presentation/auth/serializers.py:20-27`
- 影響:
  - 認証ユースケースが薄くなり、HTTP/DRF層の都合が業務ロジックに混在。
  - 認証方式変更（JWT実装切替、外部IdP対応）の影響範囲がpresentationに広がる。
- 改善案:
  - `LoginUseCase` / `RefreshTokenUseCase` を追加し、presentationは入出力変換のみ担当。
  - JWT操作は `domain.auth.gateways` のPort経由で隠蔽。

### 2. Medium: User ユースケース境界でDjangoモデル依存が漏れている
- 根拠:
  - `UserRepository` が返却型を定義しておらず（抽象が曖昧）、  
    `app/domain/user/repositories.py:12-19`
  - 実装はDjango `User` をそのまま返している。  
    `app/infrastructure/repositories/django_user_repository.py:16-20`
  - `GetCurrentUserUseCase` はその値を透過的に返却している。  
    `app/use_cases/auth/get_current_user.py:12-13`
- 影響:
  - use_cases層が実質的にORMモデル表現へ依存。
  - 将来の永続化差し替えやDTO契約の安定性が下がる。
- 改善案:
  - `domain.user.entities.UserEntity`（または `use_cases.auth.dto.CurrentUserDto`）を定義。
  - repository実装でORM→Entity/DTO変換し、use caseはEntity/DTOのみ返す。

### 3. Medium: DI経路が層ごとに不統一（container と factories が混在）
- 根拠:
  - `video` は `get_container()` を使用。  
    `app/presentation/video/views.py:16`
  - `auth` は `from app import factories` で直接取得。  
    `app/presentation/auth/views.py:31`
- 影響:
  - 依存解決ルールが統一されず、テスト時の差し替え戦略が揺れる。
- 改善案:
  - presentation層の依存解決を `AppContainer` に一本化。

### 4. Low: メール重複チェックの責務が二重化
- 根拠:
  - Serializerで重複チェック。  
    `app/presentation/auth/serializers.py:35-38`
  - UseCaseでも同じ重複チェック。  
    `app/use_cases/auth/signup.py:25-27`
- 影響:
  - ルール変更時の重複修正漏れリスク。
- 改善案:
  - ビジネスルールはUseCase側を正とし、Serializerは形式検証中心にする。

## 良い実装（維持推奨）
- 依存方向のガードテストがある。  
  `app/tests/test_import_rules.py`
- `tasks` が薄いトリガーとして実装され、ユースケースへ委譲できている。  
  `app/tasks/transcription.py`, `app/tasks/reindexing.py`, `app/tasks/account_deletion.py`
- 多くの `video/chat` ユースケースはPort（repository/gateway interface）経由で依存逆転できている。

## 総合評価
- レイヤー分離の基盤はできています（**7/10**）。
- ただし `auth` と `user` 境界に残るフレームワーク依存を整理しないと、クリーンアーキテクチャとしては「準拠途中」です。

## 優先アクション
1. `auth` のログイン/リフレッシュをUseCase化し、JWT処理をGatewayへ移動。
2. `UserEntity` or `CurrentUserDto` を導入し、`GetCurrentUserUseCase` の返却契約を固定。
3. presentationの依存解決を `container` に統一。
