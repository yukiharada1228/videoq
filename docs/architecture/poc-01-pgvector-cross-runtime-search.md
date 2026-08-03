# PoC: pgvector 認可付き検索

## 目的

`langchain-postgres`の`scene_embeddings`で、`user_id`と`video_id`を
filter可能な`metadata_columns`として使用し、Node.js / Hyperdrive経路でも
同じ認可条件が安定して適用されることを確認します。

## 対象

```sql
SELECT langchain_id, content, langchain_metadata,
       embedding <=> $1::vector AS distance
FROM scene_embeddings
WHERE (langchain_metadata->>'user_id')::bigint = $2
  AND (langchain_metadata->>'video_id')::bigint = ANY($3::bigint[])
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

Python workerは`langchain-postgres.PGVectorStore`のmetadata column filterを
index/deleteに使用します。Hono APIは独立した認可列へparameterized SQLを適用します。
LangChain.jsはJSON metadataしかfilterできず、同じ認可列を共有できないため、
比較PoCに限定します。

実行スクリプトは
[`poc/pgvector-cross-runtime/`](../../poc/pgvector-cross-runtime/) にあります。
