# Clean Architecture Review (Backend)

対象: `/Users/yukiharada/dev/videoq/backend`  
レビュー日: 2026-03-05

## 結論

このバックエンドは**概ねクリーンアーキテクチャに沿っています**。  
`domain/use_cases/presentation/infrastructure` の分離、依存方向の制約テスト、DI 経由のユースケース呼び出しは整備されています。

ただし、以下の点で「境界の純度」と「一貫性」が崩れており、完全準拠とは言えません。

## Findings (重要度順)

1. **High**: Infrastructure 層が HTTP/DRF 型 (`Response`, `status`) を返している  
該当:
- `app/infrastructure/external/llm.py:12`
- `app/infrastructure/external/llm.py:13`
- `app/infrastructure/external/llm.py:20`
- `app/infrastructure/external/llm.py:41`
- `app/infrastructure/external/llm.py:83`
- `app/infrastructure/external/rag_gateway.py:28`
- `app/infrastructure/external/rag_gateway.py:30`

内容:
- `get_langchain_llm` が `(llm, error_response)` を返し、`error_response` が DRF `Response`。
- `RagChatGateway` 側で `error_response.data` を読んでドメイン例外へ変換。

リスク:
- インフラ層がプレゼンテーション都合（HTTPステータス・レスポンス形式）を知ってしまい、境界が逆流。
- DRF 以外のインターフェース（CLI/バッチ）で再利用しにくい。

改善案:
- `llm.py` は `Response` ではなく独自例外（例: `LLMConfigError`）または純粋な `Result` 型を返す。
- HTTP ステータスへのマッピングは `presentation` 層でのみ実施する。

2. **Medium**: Auth 文脈で Video 文脈の例外を参照している  
該当:
- `app/presentation/auth/views.py:32`
- `app/presentation/auth/views.py:358`

内容:
- `ApiKeyDetailView` の NotFound ハンドリングに `app.use_cases.video.exceptions.ResourceNotFound` を使用。

リスク:
- 文脈の独立性が下がり、将来の例外整理時に巻き込み変更が発生しやすい。
- `use_cases` の cross-context import 制約は `presentation` には未適用のため、検知漏れになりやすい。

改善案:
- `app.use_cases.shared.exceptions.ResourceNotFound` に統一（または auth 専用例外）。
- 追加で `presentation` に対しても cross-context 依存チェックを導入。

3. **Medium**: Task 層の DI 経路が不統一 (`container` と `factories` が混在)  
該当:
- `app/tasks/transcription.py:10`
- `app/tasks/account_deletion.py:10`
- `app/tasks/reindexing.py:10`

内容:
- `transcription` は `get_container()` 経由。
- `account_deletion` / `reindexing` は `factories` 直参照。

リスク:
- テスト差し替え戦略がタスクごとに異なる。
- アプリ全体で「composition root をどこに置くか」が曖昧になる。

改善案:
- どちらかに統一（推奨: `container` 経由に統一）。

4. **Low**: Chat の shared アクセス検証責務が View と UseCase に重複  
該当:
- `app/presentation/chat/views.py:71`
- `app/presentation/chat/views.py:77`
- `app/use_cases/chat/send_message.py:72`
- `app/use_cases/chat/send_message.py:74`

内容:
- View で `get_shared_group_use_case` による存在確認を実施後、`SendMessageUseCase` でも再度 `group_query_repo.get_with_members(...)`。

リスク:
- ルール変更時に二重修正が必要。
- 無駄なクエリ増加の可能性。

改善案:
- グループ解決とアクセス判定は `SendMessageUseCase` に集約し、View は入力検証に専念。

## 良い点（準拠している点）

- 依存方向テストが整備されている  
  `app/tests/test_import_rules.py`
- `domain` がフレームワーク非依存の抽象ポートを提供  
  `app/domain/video/repositories.py`
- `infrastructure` が ORM モデルをエンティティへマッピングして返却  
  `app/infrastructure/repositories/django_video_repository.py`
- `presentation` が use case へ委譲する薄いアダプタ構成になっている  
  `app/presentation/video/views.py`

## 実施した確認

- アーキテクチャ制約テスト実行:
```bash
python -m unittest discover -s app/tests -p 'test_import_rules.py' -v
```
- 結果: **8件すべて成功**

## 総評

現在の構成は「クリーンアーキテクチャ志向」で、実運用に耐える分離はできています。  
一方で、`infrastructure -> HTTP表現` の混入を解消し、例外の文脈境界と DI 経路を揃えると、より厳密なクリーンアーキテクチャになります。
