# RAGプロンプトエンジニアリング

## 概要

VideoQのAIチャット機能は、RAG（Retrieval-Augmented Generation）アーキテクチャを使用して、動画の文字起こしデータに基づいて回答を生成します。このドキュメントでは、RAGで使用されるプロンプトエンジニアリングの設計と実装について説明します。

## アーキテクチャ

### プロンプトの構成要素

RAGチャットのシステムプロンプトは以下の要素で構成されます:

1. **ヘッダー**: アシスタントの役割と知識の権威範囲を定義
2. **ルール**: 回答生成の厳密な制約（例: 根拠、前提の取り扱い、不確実性の処理）
3. **フォーマット指示**: 自然な文章出力と箇条書きの回避を指定
4. **参考資料**: ベクトル検索から取得した関連シーン情報

### プロンプト生成フロー

```
User Query
    ↓
Vector Search (PGVector)
    ↓
Retrieve Related Scenes (max 6)
    ↓
Determine Locale (ja/en)
    ↓
Build Prompt (build_system_prompt)
    ↓
Send to LLM (OpenAI / Ollama)
    ↓
Generate Answer (English or Japanese)
```

## プロンプトテンプレート構成

プロンプトは `backend/app/infrastructure/external/prompts/prompts.json` で定義されています。

### デフォルトプロンプト（英語）

```json
{
  "rag": {
    "default": {
      "header": "You are {role}. Because {background}, please {request}. Follow the rules below and respond using the specified format.",
      "role": "an assistant that answers strictly and exclusively based on scenes linked to the user's video group",
      "background": "the conversation must remain fully grounded in the provided video scenes and their explanations",
      "request": "answer the user's latest message",
      "format_instruction": "Respond in clear, natural sentences. Avoid bullet points unless structural clarity would otherwise be lost.",
      "rules": [
        "Treat the provided video scenes as the sole authoritative source of truth.",
        "Do not rely on general knowledge or external information.",
        "If the premise clearly contradicts the video scenes, explicitly point out the misunderstanding.",
        "If you are genuinely unsure, explicitly state that you do not know rather than guessing.",
        "Always answer in English."
      ],
      "reference": {
        "lead": "Below are relevant scenes extracted from the user's video group.",
        "empty": "If no relevant scenes are available, explicitly state that the content is outside the scope of the video materials."
      }
    }
  }
}
```

### 日本語プロンプト

日本語ロケール（`ja`）用のプロンプトも定義されており、`Accept-Language` ヘッダーに基づいて自動選択されます。

## プロンプト生成の詳細

### build_system_prompt 関数

`backend/app/infrastructure/external/prompts/loader.py` の `build_system_prompt` 関数は、プロンプトテンプレートと検索結果を組み合わせて最終的なシステムプロンプトを生成します。

**パラメータ:**
- `locale`: ロケール（例: `"ja"`、`"en"`）。`None` の場合はデフォルト（英語）を使用
- `references`: ベクトル検索から取得した関連シーンのリスト

**生成されるプロンプト構成:**

```
[Header]

# Rules
1. [Rule 1]
2. [Rule 2]

# Format
[Format Instruction]

# Reference Materials
[Reference Lead Text]
[Related Scene 1]
[Related Scene 2]
...
[Reference Footer]
```

### 参考情報のフォーマット

各関連シーンは以下のフォーマットでプロンプトに含まれます:

```
[Video Title] [Start Time] - [End Time]
[Scene Transcription Content]
```

Example:
```
Project Overview Video 00:01:23 - 00:02:45
This project is a web application that provides video transcription and AI chat features.
Main features include video upload, automatic transcription, and AI chat.
```

## ロケールサポート

プロンプトは以下のロケールで多言語対応しています:

- `default`（英語）: デフォルトプロンプト
- `ja`（日本語）: 日本語プロンプト

ロケール解決は以下の優先順序に従います:

1. 指定されたロケール（例: `"ja-JP"`）
2. ロケールの言語部分（例: `"ja"`）
3. デフォルト（`"default"`）

### ロケールの指定

クライアントは `Accept-Language` HTTPヘッダーでロケールを指定できます:

```http
Accept-Language: ja,en;q=0.9
```

バックエンドはこのヘッダーから最初のロケールを抽出し、対応するプロンプトを使用します。

## ベクトル検索との統合

### 検索パラメータ

- **検索数（k）**: 最大6件の関連シーンを取得
- **フィルター**: ユーザーIDと動画グループ内の動画IDでフィルタリング
- **エンベディングモデル**: `EMBEDDING_MODEL` 環境変数で設定可能（デフォルト: `text-embedding-3-small`）

### 検索結果の処理

検索から取得したドキュメントは、RAGサービスの `_build_reference_entries` メソッドによってプロンプトの参考情報に変換されます:

```python
def _build_reference_entries(self, docs: Sequence[Any]) -> List[str]:
    """Generate reference information list for detailed prompt from documents"""
    reference_entries = []
    for doc in docs:
        metadata = getattr(doc, "metadata", {}) or {}
        title = metadata.get("video_title", "")
        start_time = metadata.get("start_time", "")
        end_time = metadata.get("end_time", "")
        page_content = getattr(doc, "page_content", "")
        
        reference_entries.append(
            f"{title} {start_time} - {end_time}\n{page_content}"
        )
    return reference_entries
```

## プロンプトのカスタマイズ

### プロンプトテンプレートの編集

プロンプトをカスタマイズするには、`backend/app/infrastructure/external/prompts/prompts.json` を編集してください。

**注意事項:**
- 既存のキー構成を維持してください
- 必須フィールド（`header`, `role`, `background`, `request`, `format_instruction`）を含めてください
- 新しいロケールを追加すると、`_deep_merge` を使用して `default` とマージされます

### 新しいロケールの追加

新しいロケール（例: `fr`）を追加するには:

```json
{
  "rag": {
    "default": { ... },
    "ja": { ... },
    "fr": {
      "header": "Vous êtes {role}. Parce que {background}, veuillez {request}...",
      "role": "un assistant qui répond en utilisant des scènes liées au groupe vidéo de l'utilisateur",
      ...
    }
  }
}
```

### プロンプト構成の変更

プロンプト構成を大幅に変更する必要がある場合は、`backend/app/infrastructure/external/prompts/loader.py` の `build_system_prompt` 関数も更新する必要があります。

## ベストプラクティス

### プロンプト設計原則

1. **明確な役割定義**: アシスタントの役割を明確に定義
2. **コンテキストの強調**: 提供されたシーン情報を優先するよう指示
3. **不確実性の処理**: 不確実な場合は、憶測ではなくそのことを明確に述べる
4. **出力フォーマットの指定**: 一貫した出力フォーマットを指定

### パフォーマンス最適化

- **検索数の調整**: `k` パラメータ（現在 6）を調整してプロンプトサイズと精度のバランスを取る
- **トークン制限**: 各シーンは最大 512 トークンに制限（`scene_otsu` モジュール経由）
- **キャッシュ**: プロンプト設定は `@lru_cache` でキャッシュされます

### デバッグ

プロンプト内容を確認するには:

```python
from app.infrastructure.external.prompts import build_system_prompt

# Default locale
prompt = build_system_prompt(
    locale=None,
    references=["Test Video 00:00:00 - 00:01:00\nTest content"]
)
print(prompt)

# Japanese locale
prompt_ja = build_system_prompt(
    locale="ja",
    references=["テスト動画 00:00:00 - 00:01:00\nテスト内容"]
)
print(prompt_ja)
```

## 実装ファイル

- **プロンプト定義**: `backend/app/infrastructure/external/prompts/prompts.json`
- **プロンプトローダー**: `backend/app/infrastructure/external/prompts/loader.py`
- **RAGサービス**: `backend/app/infrastructure/external/rag_service.py`
- **RAGゲートウェイ**: `backend/app/infrastructure/external/rag_gateway.py`
- **RAGドメインゲートウェイ**: `backend/app/domain/chat/gateways.py`（`RagGateway` ABC）
- **テスト**: `backend/app/infrastructure/external/prompts/tests/test_loader.py`

## Related Documentation

- [📖 ドキュメント一覧](../README.md)
- [システム構成図](system-configuration-diagram.md) — 全体アーキテクチャ
- [シーケンス図](../design/sequence-diagram.md) — チャット処理シーケンス
- [フローチャート](flowchart.md) — チャット処理フロー
- Scene Splitting: `backend/app/infrastructure/scene_otsu/`
- Transcription Processing: `backend/app/infrastructure/transcription/`
- Vector Store: `backend/app/infrastructure/external/vector_store.py`
