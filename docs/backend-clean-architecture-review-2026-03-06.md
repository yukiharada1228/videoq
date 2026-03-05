# バックエンド Clean Architecture レビュー（2026-03-06）

## 結論
**現状は「完全にクリーンアーキテクチャ準拠」とは言えません。**

理由は以下の2点です。
- 境界違反を検出するはずの `import` ルールテストが実質無効化されている
- `presentation/auth/serializers.py` にインフラ依存・認証ロジックが入り、境界がにじんでいる

一方で、ディレクトリ構成（`domain / use_cases / infrastructure / presentation`）と DI 構成（`container.py` + `factories/`）は良く整理されており、方向性自体は適切です。

---

## 主要 Findings（重大度順）

### 1. Critical: アーキテクチャ検証テストが機能していない
- 対象: `backend/app/tests/test_import_rules.py`
- 根拠:
  - `BASE` が正規化されておらず `.../app/tests/../..` のまま (`backend/app/tests/test_import_rules.py:18`)
  - `get_python_files()` がパス分割中の `tests` を見つけるとスキップする実装 (`backend/app/tests/test_import_rules.py:21-25`)
- 影響:
  - `domain/use_cases/presentation/infrastructure/tasks` のチェック対象ファイル数が 0 件になり、違反があっても CI が検出不能
- 実測:
  - `domain 0`
  - `use_cases 0`
  - `presentation 0`
  - `infrastructure 0`
  - `tasks 0`
- 備考:
  - この問題により、`test_presentation_auth_has_no_simplejwt_imports` なども実質的に no-op になっています。

### 2. High: Presentation 層に認証実装/ORM 依存が混在している
- 対象: `backend/app/presentation/auth/serializers.py`
- 根拠:
  - Django 認証直接呼び出し: `authenticate` (`:3`, `:30-33`)
  - ORM 参照: `User.objects.filter(...)` (`:19`, `:47-48`)
  - SimpleJWT 直接依存: `RefreshToken`, `TokenError` (`:8-9`, `:84-89`)
- 影響:
  - `presentation` が「入出力変換専用アダプタ」から逸脱
  - 認証/トークン検証の責務が use case / infrastructure と二重化
  - 変更時の整合性リスク増加

### 3. Medium: 認証系でバリデーション責務が二重化
- 対象:
  - `backend/app/presentation/auth/serializers.py:45-49`（メール重複判定）
  - `backend/app/use_cases/auth/signup.py:25-27`（同じく重複判定）
  - `backend/app/presentation/auth/serializers.py:26-33`（資格情報認証）
  - `backend/app/use_cases/auth/login.py:14-17`（同様に認証）
  - `backend/app/presentation/auth/serializers.py:84-89`（RefreshToken検証）
  - `backend/app/use_cases/auth/refresh_token.py:14-18`（同様に検証）
- 影響:
  - 境界の責務が曖昧になり、仕様変更時の抜け漏れを招く

---

## 良い点
- レイヤ分離の意図が明確（`app/domain`, `app/use_cases`, `app/infrastructure`, `app/presentation`）
- 依存注入の入口が `container.py` と `factories/` に集約されている
- タスク層が `container` 経由で use case を呼ぶ構成で、直接 ORM 依存を避ける方針が見える（例: `backend/app/tasks/transcription.py`）

---

## 総合判定
- 判定: **部分的にクリーンアーキテクチャを実現しているが、現状は未完成**
- 最優先対応:
  1. `test_import_rules.py` のパス正規化不備を修正し、CI の境界検証を実動化
  2. `presentation/auth/serializers.py` から認証・トークン・ORM依存を除去し、use case / infrastructure へ寄せる

