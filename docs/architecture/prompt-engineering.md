# RAGプロンプトエンジニアリング

## 概要

VideoQのAIチャット機能は、RAG（Retrieval-Augmented Generation）アーキテクチャを使用して、動画の文字起こしデータに基づいて回答を生成します。このドキュメントでは、RAGで使用されるプロンプトエンジニアリングの設計と実装について説明します。

## アーキテクチャ

### プロンプトの構成要素

RAGチャットのシステムプロンプトは以下の要素で構成されます:

1. **ヘッダー**: アシスタントの役割・背景・リクエストを定義
2. **グループコンテキスト** (任意): グループに関する補足情報
3. **ルール**: 回答生成の詳細な制約（根拠・前提の取り扱い・引用ルール等）
4. **フォーマット指示**: 自然な文章出力、インライン引用 `[N]` の使い方
5. **参照シーン**: ベクトル検索から取得した関連シーン情報（`[1]`, `[2]` 番号付き）

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
      "header": "You are {role}. Because {background}, {request}. Follow the rules below strictly and respond using the specified format.",
      "role": "an assistant that answers strictly using only the scenes included in the user's video group as evidence",
      "background": "the conversation must be based entirely on the scope of knowledge defined by the provided scenes in the video group and their explanations",
      "request": "answer the user's latest question",
      "format_instruction": "As a rule, do not use bullet points unless the structure would otherwise become unclear. Explain things clearly and concisely in natural prose. Do not stitch together spoken fragments from the video verbatim; rewrite them into polished sentences for the user. When you use a provided scene, place [N] (e.g., [1], [2]) immediately after the relevant phrase or sentence. Do not attach markers to statements that are not supported by evidence.",
      "section_titles": {
        "rules": "# Rules",
        "format": "# Format",
        "reference": "# Reference Scenes",
        "group_context": "# Group Context"
      },
      "rules": [
        "Treat the provided video scenes as the primary source of supporting evidence.",
        "Do not rely on general knowledge, external information, or independent expert knowledge that is not grounded in the video scenes.",
        "...(18 rules total)"
      ],
      "reference": {
        "lead": "The following are relevant scenes extracted from the user's video group.",
        "usage": "When answering factual or definitional questions, cite the relevant scenes inline in the form [N].",
        "footer": "Include a brief description of a scene only when it is needed to supplement the explanation.",
        "empty": "If no relevant scenes are provided, explicitly state that the content is outside the scope of the video materials and do not speculate."
      }
    }
  }
}
```

### 日本語プロンプト

日本語ロケール（`ja`）用のプロンプトも定義されており、`Accept-Language` ヘッダーに基づいて自動選択されます。ルール・フォーマット指示・セクションタイトル・参照テキストがすべて日本語で上書きされます。

## プロンプト生成の詳細

### build_system_prompt 関数

`backend/app/infrastructure/external/prompts/loader.py` の `build_system_prompt` 関数は、プロンプトテンプレートと検索結果を組み合わせて最終的なシステムプロンプトを生成します。

**シグネチャ:**
```python
def build_system_prompt(
    locale: Optional[str] = None,
    references: Optional[Sequence[str]] = None,
    group_context: Optional[str] = None,
) -> str:
```

**パラメータ:**
- `locale`: ロケール（例: `"ja"`、`"en"`）。`None` の場合はデフォルト（英語）を使用
- `references`: ベクトル検索から取得した関連シーンの文字列リスト（`[i]` プレフィックス付き）
- `group_context`: グループに関する補足情報（任意）。指定するとルールの前に `# Group Context` セクションとして挿入される

**生成されるプロンプト構成:**

```
[Header]

# Group Context        ← group_context が指定された場合のみ
[Group Context]

# Rules
1. [Rule 1]
2. [Rule 2]
...

# Format
[Format Instruction]

# Reference Scenes
[Reference Lead Text]
[1] [Video Title] [Start Time] - [End Time]
[Scene Content]
[2] [Video Title] [Start Time] - [End Time]
[Scene Content]
...
[Reference Footer]
```

### 参照情報のフォーマット

各関連シーンは以下のフォーマットでプロンプトに含まれます（`_build_reference_entries` in `rag_service.py`）:

```
[{i}] {video_title} {start_time} - {end_time}
{page_content}
```

Example:
```
[1] Project Overview Video 00:01:23 - 00:02:45
This project is a web application that provides video transcription and AI chat features.
Main features include video upload, automatic transcription, and AI chat.
```

`[N]` 番号はインライン引用で使われるため、エントリに番号が付与されます。

## ロケールサポート

プロンプトは以下のロケールで多言語対応しています:

- `default`（英語）: デフォルトプロンプト
- `ja`（日本語）: 日本語プロンプト

ロケール解決は以下の優先順序に従います:

1. 指定されたロケール（例: `"ja-JP"`）
2. ロケールの言語部分（例: `"ja"`）
3. デフォルト（`"default"`）

新しいロケールを追加すると、`_deep_merge` を使用して `default` とマージされます（指定フィールドのみ上書き）。

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

検索から取得したドキュメントは、`PGVectorRAGService._build_reference_entries` によってプロンプトの参照情報に変換されます:

```python
def _build_reference_entries(self, docs: Sequence[Any]) -> List[str]:
    reference_entries = []
    for i, doc in enumerate(docs, start=1):
        metadata = getattr(doc, "metadata", {}) or {}
        title = metadata.get("video_title", "")
        start_time = metadata.get("start_time", "")
        end_time = metadata.get("end_time", "")
        page_content = getattr(doc, "page_content", "")
        reference_entries.append(
            f"[{i}] {title} {start_time} - {end_time}\n{page_content}"
        )
    return reference_entries
```

## プロンプトのカスタマイズ

### プロンプトテンプレートの編集

プロンプトをカスタマイズするには、`backend/app/infrastructure/external/prompts/prompts.json` を編集してください。

**注意事項:**
- 既存のキー構成を維持してください
- 必須フィールド（`header`, `role`, `background`, `request`, `format_instruction`, `rules`, `section_titles`, `reference`）を含めてください
- 新しいロケールを追加すると、`_deep_merge` を使用して `default` とマージされます

### 新しいロケールの追加

新しいロケール（例: `fr`）を追加するには:

```json
{
  "rag": {
    "default": { ... },
    "ja": { ... },
    "fr": {
      "header": "Vous êtes {role}. Parce que {background}, {request}...",
      "role": "un assistant qui répond en utilisant des scènes liées au groupe vidéo de l'utilisateur",
      "section_titles": {
        "rules": "# Règles",
        "format": "# Format",
        "reference": "# Scènes de référence",
        "group_context": "# Contexte du groupe"
      },
      "rules": [...],
      "reference": { ... }
    }
  }
}
```

## ベストプラクティス

### プロンプト設計原則

1. **明確な役割定義**: アシスタントの役割を明確に定義
2. **コンテキストの強調**: 提供されたシーン情報を優先するよう指示
3. **引用ルールの明示**: `[N]` インライン引用の使い方をフォーマット指示に含める
4. **不確実性の処理**: 不確実な場合は、憶測ではなくそのことを明確に述べる
5. **前提チェック**: 質問に誤った前提が含まれる場合の処理を明示

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
    references=["[1] Test Video 00:00:00 - 00:01:00\nTest content"]
)
print(prompt)

# Japanese locale with group context
prompt_ja = build_system_prompt(
    locale="ja",
    references=["[1] テスト動画 00:00:00 - 00:01:00\nテスト内容"],
    group_context="このグループはPythonチュートリアルシリーズです。",
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
