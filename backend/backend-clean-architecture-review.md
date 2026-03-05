# バックエンド Clean Architecture レビュー

- 対象: `backend/app`
- レビュー日: 2026-03-06
- 結論: **概ねクリーンアーキテクチャに沿っていますが、厳密には未達**（境界漏れが3点）

## Findings（重要度順）

### 1. Medium: APIキー権限ポリシーがフレームワーク層に埋め込まれている
- 現状:
  - `APIKeyAuthentication` が `UserApiKey` を直接参照し、さらに「read_only でも `POST /api/chat` は許可」という業務ルールを保持しています。
- 根拠:
  - `backend/app/common/authentication.py:10`
  - `backend/app/common/authentication.py:19`
  - `backend/app/common/authentication.py:39`
  - `backend/app/common/authentication.py:48`
- 影響:
  - 認可ルール変更時に DRF 認証実装へ直接修正が必要になり、ユースケース/ドメインに閉じた変更になりません。
  - ルーティング文字列（`/api/chat`）への静的依存で、HTTP層の都合が認可ポリシーと強結合しています。
- 改善案:
  - 「アクセスレベルごとの許可判定」をユースケースまたは専用ポリシーサービスへ移し、`authentication` は本人確認のみに限定する。

### 2. Medium: 保護メディアの認可判定が View と UseCase に分散している
- 現状:
  - View 側が `settings.MEDIA_ROOT` と `os.path.exists` でファイル存在判定を先に行い、その後 UseCase でもアクセス可否を判定しています。
- 根拠:
  - `backend/app/presentation/media/views.py:38`
  - `backend/app/presentation/media/views.py:39`
  - `backend/app/use_cases/media/resolve_protected_media.py:36`
- 影響:
  - 認可ロジックが1箇所に集約されず、将来ストレージ実装（S3等）を変えたときに修正ポイントが増えます。
  - `settings.MEDIA_ROOT` 前提が Presentation に漏れており、インフラ詳細への依存が強いです。
- 改善案:
  - 存在確認を含めて UseCase + Repository 側へ寄せ、View は入出力変換のみにする。

### 3. Low: ユースケース例外契約が統一されていない（組み込み例外の露出）
- 現状:
  - `SubmitFeedbackUseCase` は `ValueError` / `PermissionError` を送出し、Presentation が直接HTTP変換しています。
- 根拠:
  - `backend/app/use_cases/chat/submit_feedback.py:34`
  - `backend/app/use_cases/chat/submit_feedback.py:39`
  - `backend/app/use_cases/chat/submit_feedback.py:43`
  - `backend/app/presentation/chat/views.py:153`
  - `backend/app/presentation/chat/views.py:155`
- 影響:
  - ユースケース境界の例外契約が曖昧になり、エラー変換ルールが散らばります。
- 改善案:
  - `use_cases.chat.exceptions` に専用例外を定義し、Presentation はその例外だけをHTTPにマップする。

## 良い点（Clean Architectureとして機能している点）

- `domain` は Django/DRF に依存していない。
  - 例: `backend/app/domain/video/repositories.py:1`
- `use_cases` は抽象ポート（Repository/Gateway）に依存しており、Django実装に直接依存していない。
  - 例: `backend/app/use_cases/video/create_video.py:8`
- ORM 実装は `infrastructure/repositories` に隔離され、Entityマッピングも同層に集約されている。
  - 例: `backend/app/infrastructure/repositories/django_video_repository.py:120`
- DI（`factories` + `container`）で具象実装の組み立て点が分離されている。
  - 例: `backend/app/factories/video.py:67`
  - 例: `backend/app/container.py:22`

## 総評

現在の実装は、**層構造としては十分にクリーンアーキテクチャ寄り**です。  
一方で、認可ポリシーと一部の存在判定が外側層に残っているため、厳密には「完全準拠」とは言い切れません。  
上記3点を解消すれば、依存方向・責務分離ともにより明確になります。
