# プロンプト設計

## RAG chat

Hono chat service は次の順で prompt を構築します。

1. user / share の認可
2. group に属する video ID の解決
3. `scene_embeddings` を user ID / video ID で filter して検索
4. timestamp と引用可能な scene content を context 化
5. system policy、locale、group context、検索 context を結合
6. LLM を呼び、answer と citation を `chat_logs` に保存

検索結果は命令ではなく参照資料として区切り、system policy より優先させません。
外部入力を prompt に入れる前に件数・長さを制限します。

## Study mode

Study mode は PLOG の concept graph と learning object を使います。

- concept routing は embedding search
- unmet prerequisite があれば前提 concept へ誘導
- opening turn は静的 scaffold
- learner reply を短い grading call で評価
- hint ladder と次 concept を session state で更新

一時状態は `STUDY_SESSION` KV に保存し、TTL 後に削除します。

## 設定

| 変数 | 用途 |
|---|---|
| `LLM_MODEL` | 回答・PLOG 生成モデル |
| `EMBEDDING_PROVIDER` | `openai` / `ollama` |
| `EMBEDDING_MODEL` | query / scene embedding model |
| `EMBEDDING_VECTOR_SIZE` | `scene_embeddings.embedding` の次元 |
| `OLLAMA_BASE_URL` | local provider endpoint |

prompt の組み立ては API の chat / PLOG service、offline PLOG build は
`apps/worker/worker_python/pipeline/` を参照してください。

## 評価

- answer relevance
- faithfulness
- context precision
- citation が許可された video 範囲内であること
- prompt injection を含む scene でも system policy が維持されること
- locale ごとの response quality
