# PoC: quota・アップロード競合

## 目的

複数の upload reservation が同時に実行されても、保存容量上限を超えて予約しないことを
PostgreSQL の条件付き update と Hyperdrive 経路で確認します。

## 予約

```sql
UPDATE users
SET used_storage_bytes = used_storage_bytes + $2
WHERE id = $1
  AND (storage_limit_gb IS NULL OR used_storage_bytes + $2 <= $3)
RETURNING used_storage_bytes;
```

0 row の場合は上限超過です。read と write を分離せず、一つの SQL statement で判定します。

## 解放

```sql
UPDATE users
SET used_storage_bytes = GREATEST(0, used_storage_bytes - $2)
WHERE id = $1;
```

放棄された upload は scheduled reconciliation で解放します。

## 実測

| 条件 | 結果 |
|---|---|
| limit 100、size 30、20 並行 | 3 成功、used 90 |
| limit 100、size 15、30 並行 | 6 成功、used 90 |
| reserve 30、release 2 回 | 30 → 0 → 0 |

いずれも上限超過と負数は発生しませんでした。

検証 Worker は
[`poc/worker-hyperdrive-pg/`](../../poc/worker-hyperdrive-pg/) にあります。
