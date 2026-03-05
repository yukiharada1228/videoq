# バックエンド Clean Architecture レビュー

- 対象: `backend/app`（domain / use_cases / infrastructure / presentation / tasks 周辺）
- 実施日: 2026-03-06
- 実施コマンド: `cd backend && python -m unittest app.tests.test_import_rules -v`（29 tests, all green）

## Findings（重大度順）

### 1. Medium: Presentation が Container 経由で Infrastructure 実装を直接利用している
- 根拠:
  - `backend/app/container.py:191` で `DjangoFileUrlResolver` を直接返却
  - `backend/app/presentation/video/views.py:92` ほかで `container.get_file_url_resolver()` を serializer context に注入
  - `backend/app/presentation/video/serializers.py:35` で resolver を呼び出して URL 解決
- 問題:
  - 直接 import は避けられている一方、実質的には Presentation が Infrastructure 実装に依存しています。
  - 依存方向違反が「Container 経由の抜け道」で見えにくくなり、UseCase 契約だけを見ても応答仕様が完結しません。
- 改善案:
  - `file_url` を UseCase 出力 DTO に含める（UseCase に `FileUrlResolver` port を注入）
  - もしくは、URL 解決を Presentation 専用 adapter に閉じて Container の `infrastructure utility` 公開をやめる

### 2. Low: `app.utils` が層横断の受け皿になっており、責務境界が曖昧
- 根拠:
  - `backend/app/utils/query_optimizer.py:7-9` は Django `QuerySet` と `app.models` に依存（Infrastructure 相当）
  - `backend/app/utils/mixins.py:3-6` は DRF/認証を扱う（Presentation 相当）
  - `backend/app/utils/embeddings.py:5-10` は外部 SDK と settings を扱う（Infrastructure 相当）
- 問題:
  - `utils` が層別でなく機能別でもなく混在し、将来の依存ルール逸脱ポイントになりやすいです。
  - 現在の import ルールは `domain/use_cases -> utils` を禁止していますが、`presentation/infrastructure -> utils` は広く許容されます。
- 改善案:
  - `utils` を段階的に分割（例: `presentation/common/*`, `infrastructure/common/*`）
  - import ルールに「`presentation` と `infrastructure` の `utils` 共有禁止（または許可リスト方式）」を追加

### 3. Low: URL 解決責務の置き場所がユースケース間で不統一
- 根拠:
  - Chat の人気シーンでは UseCase が URL 解決 (`backend/app/use_cases/chat/get_popular_scenes.py:23-66`)
  - Video では Presentation serializer が URL 解決 (`backend/app/presentation/video/serializers.py:35-37`)
- 問題:
  - 同じ「file URL を返す」責務の境界が揺れており、アーキテクチャ判断基準がぶれます。
- 改善案:
  - 「URL 解決は UseCase で行う」または「Presentation で行う」のどちらかに統一

## 総評
- 判定: **概ね Clean Architecture になっています**。
- 理由:
  - `domain` / `use_cases` / `infrastructure` / `presentation` の分離は明確です。
  - 依存方向を担保する import ルールテストが整備され、実行結果も green です（29 tests）。
- ただし:
  - Container 経由の実装依存と `utils` の横断利用は、将来の境界劣化ポイントです。
  - 今のうちに責務境界を明文化・統一すると、クリーンさを維持しやすくなります。
