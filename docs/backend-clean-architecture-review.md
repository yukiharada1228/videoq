# バックエンド Clean Architecture レビュー

レビュー日: 2026-03-06
対象: `backend/app`（domain / use_cases / infrastructure / presentation / tasks / common / factories / container）

## 結論

現状は **「概ねクリーンアーキテクチャに沿っているが、完全ではない」** です。  
`domain` と `use_cases` はフレームワーク依存が抑えられており、DI（`container` + `factories`）も導入されています。一方で、`app/common` 経由で ORM 依存が入り込む経路があり、厳密な依存方向の維持には追加のガードが必要です。

## 主な指摘（重大度順）

### 1. Medium: `app/common` が ORM に直接依存し、レイヤ境界をバイパスしている

- 根拠:
  - `backend/app/common/permissions.py:7`
  - `backend/app/common/permissions.py:19`
  - `backend/app/common/authentication.py:10`
  - `backend/app/common/authentication.py:24`
- 内容:
  - `ShareTokenAuthentication` が `VideoGroup.objects...` を直接実行。
  - `APIKeyAuthentication` が `UserApiKey.objects...` を直接実行。
- リスク:
  - プレゼンテーション周辺の共通モジュールから永続化層へ直接触れる経路が固定化され、境界が曖昧になる。
  - テスト容易性・置換容易性（ORM以外への移行）が下がる。
- 改善案:
  - `ShareToken` / `API Key` の解決を UseCase + Port + Infrastructure Adapter に寄せる。
  - もしくは `common` を「外側レイヤ専用」と明示し、責務を `presentation` / `infrastructure` に再配置する。

### 2. Medium: CI の import ルールが `app/common` を検査対象にしていない

- 根拠:
  - `backend/app/tests/test_import_rules.py:162` 以降（`domain/use_cases/presentation/infrastructure/tasks/media` は検査）
  - `backend/app/tests/test_import_rules.py:4-10`（受け入れ条件に `common` 記載なし）
- 内容:
  - 現在の静的ガードは中核レイヤには有効だが、実際のリクエスト経路で使われる `app/common` の依存方向は未拘束。
- リスク:
  - 境界違反が CI で検出されず、将来の変更で依存の逆流が進む可能性。
- 改善案:
  - `app/common` 用のルールを追加（例: `app.models` 直接参照禁止 or 許可ファイルを明示ホワイトリスト化）。

### 3. Low: リクエストコンテキストに ORM オブジェクトを流している

- 根拠:
  - `backend/app/common/permissions.py:23`
  - `backend/app/presentation/media/views.py:45-46`
- 内容:
  - `request.auth` に `{"group": <VideoGroup ORM>}` を載せ、View 側が ORM 属性 (`group.id`) を読む構成。
- リスク:
  - 認証・認可の境界で永続化表現が漏れ、インターフェース契約が暗黙化する。
- 改善案:
  - `group_id` など最小プリミティブ値のみを渡す、または専用DTOを返す。

## 良い点

- `domain` / `use_cases` から Django・DRF・ORM への直接依存を禁止するテストがある。
- `infrastructure -> use_cases` の逆依存禁止がテストで守られている。
- `presentation` は `container` 経由で UseCase を呼び出す構成に統一されている。
- `tasks` は薄いトリガとして UseCase 呼び出しに寄せられている。

## 実行した検証

- コマンド: `cd backend && python -m unittest app.tests.test_import_rules -v`
- 結果: **32 tests, OK**（import ルール検査は現状パス）

## 総合評価

- 評価: **B（実運用上は良好、厳密性は改善余地あり）**
- 判断:
  - 中核レイヤの分離はできている。
  - ただし `common` に残る ORM 直参照が、Clean Architecture の厳密性を下げている。
