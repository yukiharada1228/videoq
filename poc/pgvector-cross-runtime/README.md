# pgvector 検索 PoC

metadata columnsを持つ`scene_embeddings`に対する認可付きcosine検索を、直接SQLと
`@langchain/community` PGVectorStoreで比較するread-only PoCです。

## 入力

- 読み取り専用 `DATABASE_URL`
- `config.json`: `user_id`, `video_ids`, `queries`, `k`
- `out/query_embeddings.json`: 各 query と同じ次元の embedding

```json
[
  { "query": "質問", "embedding": [0.1, 0.2] }
]
```

## 実行

```bash
cp config.example.json config.json
mkdir -p out
psql "$DATABASE_URL" -f 0_schema_probe.sql

DATABASE_URL="$DATABASE_URL" node 2_direct_sql.mjs \
  --config config.json \
  --emb out/query_embeddings.json \
  --out out/direct_sql.json

DATABASE_URL="$DATABASE_URL" node 3_langchain_js.mjs \
  --config config.json \
  --emb out/query_embeddings.json \
  --out out/langchain_js.json

node 4_compare.mjs \
  --golden out/direct_sql.json \
  --candidate out/langchain_js.json \
  --config config.json \
  --label langchain-js
```

すべて SELECT のみです。本番ではなく staging / replica と read-only user を使用してください。

## 判定

- top 10 overlap 90% 以上
- 共通結果の順位相関 0.9 以上
- `user_id` / `video_id` の認可漏れ 0
- query error なし

API runtimeは独立した認可列へ直接SQLを適用します。LangChain.jsは比較対象のみです。
