# バックエンド クリーンアーキテクチャレビュー

レビュー日: 2026-03-06  
対象: `/Users/yukiharada/dev/videoq/backend/app`

## 指摘事項（重要度順）

### 1. [Medium] UseCase層にCSVフォーマット責務が混在している
- 根拠: `app/use_cases/chat/export_history.py:23-58`
- `ExportChatHistoryUseCase` が「CSV行形式（`"true"/"false"` 文字列化、JSON文字列化）」を直接生成しています。
- クリーンアーキテクチャでは、UseCaseはアプリケーションルールのオーケストレーションに集中し、CSVという出力フォーマットは外側（presentation/export adapter）で扱う方が責務分離が明確です。
- 推奨:
  - UseCaseは「ドメイン寄りDTOの列挙」まで返す。
  - CSVヘッダ/文字列変換はPresentation側のExporterに移す。

### 2. [Medium] Domain DTOの境界が弱く、フレームワーク依存の型が入り込みやすい
- 根拠: `app/domain/video/dto.py:16`
- `CreateVideoParams.file` が `Any` で、コメント上も `InMemoryUploadedFile` を前提にしています。
- `app/use_cases/video/dto.py` では `UploadedFile` Protocol で抽象化できているため、Domain側で `Any` に戻してしまうと、型安全性と境界の明確性が下がります。
- 推奨:
  - Domain DTO側も Protocol/明示インターフェースで受ける（少なくとも `BinaryIO` もしくは自前Protocol）。

### 3. [Low] ファイルURL解決の実装が二重化し、Adapter方針が不統一
- 根拠:
  - `app/presentation/video/serializers.py:22-30`（`default_storage` を直接参照）
  - `app/presentation/chat/views.py:274-287`（container経由の `file_url_resolver` を利用）
- 同じ「file_key -> 公開URL」変換が別経路で実装されており、将来のURL生成ポリシー変更時に差分・不整合リスクがあります。
- 推奨:
  - URL解決を1つのPort/Resolverに集約し、Presentation層はそれを統一利用する。

### 4. [Low] importルールは強力だが、UseCaseの“共有モジュール経由の迂回依存”までは未検出
- 根拠: `app/tests/test_import_rules.py:150-153`
- `use_cases` の禁止対象は `app.models/django/rest_framework/app.infrastructure` で、`app.common` のような外側モジュール経由の依存はルール上通る余地があります（現状違反は未確認）。
- 推奨:
  - `use_cases` の許可importを allow-list 化するか、`app.common`/`app.utils` への依存も明示的に制限する。

## 良い点

- レイヤ分割（`domain / use_cases / infrastructure / presentation`）は明確で、責務の大枠は守られています。
- Port/Repository/Gatewayによる依存逆転が成立しており、UseCaseはインターフェース依存になっています。
- DIの合成ルート（`factories.py` + `container.py`）があり、ViewやTaskが直接Infrastructureに触れにくい設計です。
- 依存方向をCIで守るテストが整備されています（`app/tests/test_import_rules.py`）。

## 総評

現状は **「概ねクリーンアーキテクチャに準拠」** です。  
ただし、`export_history` のような出力フォーマット責務の内側流入と、ファイルURL解決の実装分散は、将来的な拡張時に境界を崩しやすいポイントです。  
優先度としては、まず `ExportChatHistoryUseCase` の責務分離を先に改善するのが効果的です。

## 実施した確認

- レイヤ構成と主要実装の読解（Domain / UseCase / Presentation / Infrastructure）
- importルールテストの実行:
  - 実行コマンド: `python -m unittest -q app.tests.test_import_rules`
  - 結果: `Ran 26 tests ... OK`

## 追記（docker compose exec 実行結果）

- コンテナ内で実行:
  - 実行コマンド: `docker compose exec backend python -m unittest -q app.tests.test_import_rules`
  - 結果: `Ran 8 tests in 0.002s`, `OK`
- 補足:
  - ホスト実行では `26 tests`、コンテナ実行では `8 tests` でした。
  - 現在の `docker-compose.yml` では `backend` サービスにソース全体をバインドしていないため、コンテナ内はイメージビルド時点のコード/テストセットで実行されている可能性があります。
