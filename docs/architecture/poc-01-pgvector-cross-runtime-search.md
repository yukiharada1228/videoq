# PoC: pgvector 認可付き検索

## 目的

`scene_embeddings` の cosine 検索で、`user_id` と `video_id` の filter が
結果へ確実に適用され、Node.js / Hyperdrive 経路で安定して実行できることを確認します。

## 対象

```sql
SELECT id, content, langchain_metadata, user_id, video_id,
       embedding <=> $1::vector AS distance
FROM scene_embeddings
WHERE user_id = $2
  AND video_id = ANY($3::bigint[])
ORDER BY embedding <=> $1::vector
LIMIT $4;
```

## 合格条件

- 許可された user / video 以外の row が 0
- distance 昇順
- 同じ embedding に対する結果が再現可能
- staging data の P95 が API の許容範囲内
- EXPLAIN で件数増加時の index 方針を確認できる

## 結論

認可列が JSON metadata ではなく独立列であるため、runtime は parameterized
direct SQL を使用します。標準 vector store wrapper は比較対象に留めます。

実行スクリプトは
[`poc/pgvector-cross-runtime/`](../../poc/pgvector-cross-runtime/) にあります。
