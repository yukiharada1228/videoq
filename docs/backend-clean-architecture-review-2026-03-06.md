# バックエンド クリーンアーキテクチャレビュー（2026-03-06）

## 結論
- 現状は **「概ねクリーンアーキテクチャに沿っているが、完全ではない」** です。
- レイヤー分割（`domain` / `use_cases` / `presentation` / `infrastructure`）とDI配線（`composition_root`）は明確です。
- 一方で、JWT実装責務が `presentation/common` に残っており、依存境界ルールの検知範囲にも穴があります。

## 指摘事項（重要度順）

### 1. Medium: JWT実装責務が presentation 層に漏れている
- 根拠:
  - `presentation/common` が `rest_framework_simplejwt` を直接 import し、`JWTAuthentication` を継承している  
    - `backend/app/presentation/common/authentication.py:9`
    - `backend/app/presentation/common/authentication.py:10`
    - `backend/app/presentation/common/authentication.py:83`
  - 一方で `infrastructure` 側には「JWTロジックをここに隔離する」意図が明記されている  
    - `backend/app/infrastructure/auth/simplejwt_gateway.py:1`
    - `backend/app/infrastructure/auth/simplejwt_gateway.py:3`
- 影響:
  - 認証実装の詳細（フレームワーク依存）がプレゼンテーション層に滞留し、差し替え容易性が下がります。
- 改善案:
  - `CookieJWTAuthentication` のトークン検証責務を `infrastructure/auth` 側に寄せ、`presentation` は抽象インターフェース経由で利用する。

### 2. Low: importルールがJWT依存漏れを検知できない
- 根拠:
  - `simplejwt` 禁止テストの対象が `presentation/auth` のみ  
    - `backend/app/tests/test_import_rules.py:313`
    - `backend/app/tests/test_import_rules.py:316`
  - 実際の `simplejwt` 依存は `presentation/common` にある（上記1）。
- 影響:
  - CIがグリーンでも、方針違反が残る可能性があります。
- 改善案:
  - `presentation/auth` 限定ではなく `presentation` 全体を対象に `rest_framework_simplejwt` 禁止ルールを適用する。

### 3. Low: use_cases のコンテキスト分離テストに media が含まれていない
- 根拠:
  - cross-context テスト対象は `chat/auth/video` の3つのみ  
    - `backend/app/tests/test_import_rules.py:254`
    - `backend/app/tests/test_import_rules.py:261`
    - `backend/app/tests/test_import_rules.py:268`
- 影響:
  - 将来 `use_cases/media` から他コンテキストへ直接依存しても、現行ルールでは検出できません。
- 改善案:
  - `use_cases/media` も cross-context import チェックに追加する。

## 良い点
- ドメイン層に抽象ポート/リポジトリがあり、ORM非依存の境界が維持されている  
  - `backend/app/domain/video/repositories.py:1`
- ユースケースはドメインポートに依存し、具体実装はDIで注入されている  
  - `backend/app/use_cases/auth/refresh_token.py:5`
  - `backend/app/composition_root/auth.py:38`
- プレゼンテーション層から `app.models` / `app.infrastructure` への直接依存を禁止するテストが整備されている  
  - `backend/app/tests/test_import_rules.py:227`

## 検証メモ
- 依存境界の確認はソースレビューと `rg` による横断検索で実施。
- ローカル実行環境に `pytest` / `django` が未導入のため、テスト実行による再検証は未実施。
