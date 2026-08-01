# PoC #01 実行スクリプト: pgvector クロスランタイム検索検証

手順書本体: [`docs/architecture/poc-01-pgvector-cross-runtime-search.md`](../../docs/architecture/poc-01-pgvector-cross-runtime-search.md)

現行 Python（langchain-postgres v2）の検索を**ゴールデン**として採取し、移行先の
**直接 SQL** と **LangChain.js 標準 PGVector** が同等に再現できるかを実測して、
DR-4（直接 SQL 第一 or 標準 PGVector 可）を確定する。

> ⚠️ **全スクリプト READ-ONLY**。`videoq_scenes` 等へ INSERT/UPDATE/DDL は行わない。
> **本番ではなくステージング/レプリカ**で、**読み取り専用 DB ユーザー**を使うこと。

## 必要な入力（あなたが用意）

- `DATABASE_URL`: ステージング/レプリカへの読み取り専用接続文字列
- `OPENAI_API_KEY`: `EMBEDDING_MODEL`（既定 `text-embedding-3-small`）と一致するキー
- `config.json`: `config.example.json` をコピーし、**実在する** `user_id` / その配下の `video_ids` / 検証 `queries` を記入

```bash
cp config.example.json config.json && $EDITOR config.json
```

## 実行順

```bash
# 0) 出力先
mkdir -p out

# 1) 実スキーマ・index・件数（G1）— 手順書 §4 Step1 の SQL を psql で
psql "$DATABASE_URL" -f 0_schema_probe.sql | tee out/schema_probe.txt

# 2) Python ゴールデン（backend の venv で。Django app を import するため）
#    ※ スクリプトは backend/ を sys.path に自動追加するが、実行は backend/ 内が確実。
cd ../../backend
DJANGO_SETTINGS_MODULE=videoq.settings \
DATABASE_URL="$DATABASE_URL" OPENAI_API_KEY="$OPENAI_API_KEY" \
.venv/bin/python ../poc/pgvector-cross-runtime/1_baseline_python.py \
  --config ../poc/pgvector-cross-runtime/config.json \
  --out ../poc/pgvector-cross-runtime/out/python_golden.json \
  --emb-out ../poc/pgvector-cross-runtime/out/query_embeddings.json
cd ../poc/pgvector-cross-runtime

# 3) 直接 SQL（DR-4 本命）
#    依存はバージョン固定 + lockfile 化して再現性を担保（npm i の後 package-lock.json をコミット）
npm i pg@8
DATABASE_URL="$DATABASE_URL" node 2_direct_sql.mjs \
  --config config.json --emb out/query_embeddings.json --out out/direct_sql.json

# 4) LangChain.js 標準（互換性検証。0件/ERROR になれば非互換が確定）
npm i @langchain/community@0 @langchain/openai@0 @langchain/core@0
DATABASE_URL="$DATABASE_URL" OPENAI_API_KEY="$OPENAI_API_KEY" node 3_langchain_js.mjs \
  --config config.json --emb out/query_embeddings.json --out out/langchain_js.json

# 5) 比較・判定
node 4_compare.mjs --golden out/python_golden.json --candidate out/direct_sql.json  --config config.json --label direct-sql
node 4_compare.mjs --golden out/python_golden.json --candidate out/langchain_js.json --config config.json --label langchain-js
```

## 合否の読み方

- **direct-sql が PASS / langchain-js が FAIL（想定本命 = DR-4 判定B）**
  → 要件定義書の「直接 SQL 第一候補」を確定。Repository をこの SQL に固定。
- **両方 PASS（判定A）** → 標準 PGVector も選択肢に。
- **direct-sql も FAIL（判定C）** → 認可漏れ/レイテンシ要因を `out/schema_probe.txt` と
  `direct_sql.json` の EXPLAIN で切り分け（index 不在なら HNSW 追加、DR-3 の JOIN 方式を検討）。

判定は要件定義書 §16.1 DR-4 行 と §13 Phase 5 完了条件へ反映する。

## ファイル

| ファイル | 役割 |
|---|---|
| `config.example.json` | 入力テンプレ（user_id / video_ids / queries / k） |
| `0_schema_probe.sql` | 実 DDL・index・件数・JSON メタ確認（G1） |
| `1_baseline_python.py` | 現行と同一の埋め込み・VectorStore でゴールデン採取（READ-ONLY） |
| `2_direct_sql.mjs` | 直接 SQL 再現 + EXPLAIN（READ-ONLY） |
| `3_langchain_js.mjs` | LangChain.js 標準 PGVector 再現（READ-ONLY, `skipInitializationCheck`） |
| `4_compare.mjs` | 上位一致率・順位相関・認可漏れで PASS/FAIL 判定 |
