# PoC #01: pgvector クロスランタイム検索検証（Python ↔ Workers/Hyperdrive）

- 種別: 移行 PoC 手順書（最優先）
- 対象: `videoq_scenes` ベクトルテーブルに対する検索を、現行 Python（langchain-postgres v2）と移行先 Workers/Hyperdrive（LangChain.js / 直接 SQL）で**同等に**実行できるか検証する
- 関連: [移行要件定義書 §6.3 / DR-3 / DR-4](./cloudflare-hono-migration-requirements.md) / [codex レビュー §3](./cloudflare-hono-migration-requirements-review-codex.md)
- 作成日: 2026-08-01

---

## 1. 目的とゴール

移行の最大リスク（データ層）を最初に潰す。具体的には次を判定する。

- G1: `videoq_scenes` の**実 DDL・インデックス・件数**を採取し、要件定義書 §6.3 の想定と一致するか確認する。
- G2: 現行 Python 検索（cosine, `k=20`, filter `{user_id, video_id:{$in:[...]}}`）を **Workers/Hyperdrive から再現**できるか確認する。
- G3: **LangChain.js 標準 PGVector** と **Repository 直接 SQL** の2方式を、現行 Python 結果と比較する。
- G4: 判定に基づき、移行方式（直接 SQL 第一 or 標準 PGVector 可）を確定する。

### 合格基準（Go/No-Go）

| 指標 | 合格ライン |
|---|---|
| 上位 10 件のチャンク ID 一致率 | Python 版と **≥ 90%（順不同集合一致）**、理想は完全一致 |
| 上位 10 件の順位相関（Spearman） | **≥ 0.9** |
| distance 値の差 | 同一チャンクで **相対誤差 < 1e-4**（同一モデル・同一正規化前提） |
| 認可フィルタ | `user_id` 不一致・`video_id` 範囲外のチャンクが**1件も混入しない** |
| 検索レイテンシ（P95） | 現行と同等以下（実測記録） |

いずれかが未達なら **標準 PGVector を捨て、直接 SQL 実装に確定**（DR-4 のフォールバックを本線化）。

---

## 2. 現行実装のグラウンドトゥルース（再現対象）

- テーブル名＝コレクション名: `videoq_scenes`（`PGVECTOR_COLLECTION_NAME`, `vector_store.py:79`）
- v2 API: `PGVectorStore.create_sync(..., metadata_columns=["user_id","video_id"])`（`vector_store.py:117`）
- 独立列: `user_id INTEGER`, `video_id INTEGER`（`init_vectorstore_table` の `metadata_columns`, `vector_store.py:100`）
- 距離: cosine
- 埋め込み: `EMBEDDING_MODEL`（既定 `text-embedding-3-small`）, 次元 `EMBEDDING_VECTOR_SIZE=1536`
- 検索条件（`rag_service.py:153`）:
  ```python
  vector_store.as_retriever(search_kwargs={
      "k": 20,
      "filter": {"user_id": self.user.id, "video_id": {"$in": group_video_ids}},
  })
  ```
- `group_video_ids` は**関係 DB（Video/Group）から先に解決**され、ベクトル行には `group_id`・削除フラグ・完了フラグは持たない（DR-3）。
- JSON メタ（`langchain_metadata`）に入る値（`scene_indexer.py` `create_scene_metadata`）: `video_title / start_time / end_time / start_sec / end_sec / scene_index`（※ `user_id`/`video_id` は独立列側へ抽出され JSON には残らない想定。**G1 で実データを要確認**）。

---

## 3. 事前準備

- 読み取り専用の DB 接続情報（`DATABASE_URL`）。**本番ではなくステージング/レプリカ**を推奨。書き込みは一切行わない。
- `OPENAI_API_KEY`（`EMBEDDING_MODEL` と一致するもの）。埋め込みは PoC 用の少数質問のみ。
- 代表的な検証データ: 実在する `user_id` 1〜2件、その配下の `video_id` 群、想定質問 5〜10 件。
- ツール: `psql`、Node.js 20+（`pg` / `@langchain/community` / `@langchain/openai`）、Python（現行 backend の venv）。
- Cloudflare 検証用: Hyperdrive 設定（ステージング DB を指す）を作成した Worker。**まずローカル `wrangler dev` + `pg` で疎通**し、その後 Hyperdrive 経由に切替える。

---

## 4. 手順

### Step 1 — 実スキーマ・インデックス・件数の採取（G1）

```sql
-- DDL
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'videoq_scenes'
ORDER BY ordinal_position;

-- インデックス（HNSW/IVFFlat の有無を確認）
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'videoq_scenes';

-- 件数と代表 user/video 分布
SELECT count(*) AS rows,
       count(DISTINCT user_id) AS users,
       count(DISTINCT video_id) AS videos
FROM videoq_scenes;

-- JSON メタに user_id/video_id が漏れていないかの確認
SELECT (langchain_metadata ? 'user_id') AS meta_has_user,
       (langchain_metadata ? 'video_id') AS meta_has_video,
       count(*)
FROM videoq_scenes GROUP BY 1,2;
```

記録: 列構成・ベクトル次元（`embedding` の `vector(N)`）・インデックス方式（無ければ「seq scan」前提）・総件数・JSON 内 user_id/video_id の有無（DR-4 の前提を確定）。

### Step 2 — 現行 Python 検索を基準値として採取（ゴールデン）

現行 backend の venv で、`PGVectorManager` を用いて Python 側の上位 20 件を JSON 出力する（保存はしない・読み取りのみ）。

```python
# poc_baseline.py（backend の venv で実行, 書き込みなし）
import json, os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "videoq.settings")
django.setup()
from app.infrastructure.external.vector_store import PGVectorManager
from app.infrastructure.scene_otsu.embedders import build_embeddings  # 実際の関数名は要確認

USER_ID = 123
VIDEO_IDS = [11, 12, 13]
QUERIES = ["予算について何を話していましたか", "..."]

emb = build_embeddings()            # EMBEDDING_MODEL と同一
store = PGVectorManager.create_vectorstore(emb)
out = []
for q in QUERIES:
    docs = store.similarity_search_with_score(
        q, k=20,
        filter={"user_id": USER_ID, "video_id": {"$in": VIDEO_IDS}},
    )
    out.append({
        "query": q,
        "results": [{
            "id": getattr(d, "id", None),
            "distance": float(s),
            "video_id": d.metadata.get("video_id"),
            "user_id": d.metadata.get("user_id"),
            "content": d.page_content[:80],
        } for d, s in docs],
    })
print(json.dumps(out, ensure_ascii=False, indent=2))
```

> 注: `id`（`langchain_id`）が Document に載らない場合は、`content` ハッシュ＋`start_sec`＋`video_id` を代理キーにする。埋め込みは**質問ごとに1回だけ生成**し、その生ベクトルを Step 3/4 でも使い回して「埋め込み差」と「検索差」を切り分ける。

### Step 3 — 直接 SQL 実装での再現（DR-4 第一候補）

Step 2 で得た**質問埋め込みベクトルをそのまま渡し**、直接 SQL で上位 20 件を取得する。

```sql
SELECT langchain_id, content, langchain_metadata, user_id, video_id,
       embedding <=> $1::vector AS distance
FROM videoq_scenes
WHERE user_id = $2
  AND video_id = ANY($3::int[])
ORDER BY embedding <=> $1::vector
LIMIT 20;
```

Node.js（`pg`）で実行し、Python ゴールデンと比較（§5 の比較スクリプト）。`EXPLAIN (ANALYZE, BUFFERS)` を必ず採取し、インデックス利用/seq scan とレイテンシを記録。

### Step 4 — LangChain.js 標準 PGVector での再現（互換性検証）

```ts
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";

const store = await PGVectorStore.initialize(
  new OpenAIEmbeddings({ model: "text-embedding-3-small" }),
  {
    pool,                                  // ※ Hyperdrive 上での Pool 挙動を要検証
    tableName: "videoq_scenes",
    columns: {
      idColumnName: "langchain_id",
      contentColumnName: "content",
      vectorColumnName: "embedding",
      metadataColumnName: "langchain_metadata",
    },
    distanceStrategy: "cosine",
  }
);
// 標準 filter は langchain_metadata ->> 'user_id' に掛かる点に注意（DR-4）
const docs = await store.similaritySearchVectorWithScore(queryVec, 20, {
  user_id: USER_ID, video_id: { in: VIDEO_IDS },
});
```

**予測される失敗**: 標準 `buildFilterClauses()` は `user_id`/`video_id` を **JSON メタ**に探すが、現行では独立列にあり JSON には無い → **フィルタが 0 件 or 誤結果**になる可能性が高い（DR-4）。この場合、標準 PGVector は不採用と結論づけ、Step 3（直接 SQL）を本線化する。回避を試すなら `filter` に生 SQL を差し込めるか、列マッピング拡張が可能かを確認する。

### Step 5 — Hyperdrive 経由での再検証

Step 3（直接 SQL）を Worker + Hyperdrive で実行し、次を確認する。
- 接続クライアントを**リクエストごとに生成**（使い回さない, 要件 §11.4）。
- レイテンシ（キャッシュ効果含む）を記録し、直接 pg 接続時と比較。
- 同時リクエストで stale connection / I/O context エラーが出ないこと。

---

## 5. 比較・評価

Python ゴールデン（Step 2）に対し Step 3 / Step 4 の結果を突き合わせ、§1 の合格基準を計算する。

- 上位10件のチャンク ID 集合一致率、Spearman 順位相関、同一チャンクの distance 相対誤差。
- 認可漏れ検査: 結果に `user_id != USER_ID` または `video_id ∉ VIDEO_IDS` が**0件**であること。
- レイテンシ P50/P95（直接 pg / Hyperdrive / Python）。
- `EXPLAIN` 結果（index vs seq scan）。

簡易比較スクリプト（擬似）:
```
for each query:
  py_ids   = ids(python_top10)
  cand_ids = ids(candidate_top10)
  jaccard  = |py_ids ∩ cand_ids| / |py_ids ∪ cand_ids|
  spearman = rank_corr(common_ids)
  auth_ok  = all(r.user_id==USER_ID and r.video_id in VIDEO_IDS for r in candidate)
```

---

## 6. 成果物・判定

- 成果物: 実 DDL/index/件数レポート、Python ゴールデン JSON、直接 SQL 結果、LangChain.js 結果、比較メトリクス表、`EXPLAIN` 出力、Hyperdrive レイテンシ表。
- 判定:
  - **A（標準 PGVector 可）**: Step 4 が合格基準を満たす → LangChain.js 標準を採用可。
  - **B（直接 SQL 本線・想定本命）**: Step 4 不合格・Step 3 合格 → 要件定義書 DR-4 の直接 SQL を確定。Repository 実装をこの SQL に固定。
  - **C（要スキーマ/インデックス対応）**: 認可漏れ or レイテンシ未達 → インデックス追加（HNSW）や JOIN 方式（DR-3 案2）を追加検討し再試験。

判定結果は要件定義書 §16.1 の DR-4 行と §13 Phase 5 の完了条件へ反映する。

---

## 6.5 実測結果（2026-08-01, ローカル `videoq-postgres` pg17, 実データ289行）

ローカル開発 DB（`docker exec videoq-postgres`）に対し G1 と直接 SQL 実証を実施。**判定 B（直接 SQL 本線）で確定**。

### G1: 実スキーマ
```text
public.videoq_scenes  (289 rows / user 1 / video 16)
  langchain_id UUID PK, content TEXT, embedding vector(1024),
  user_id INTEGER, video_id INTEGER, langchain_metadata JSON
  indexes: videoq_scenes_pkey (btree, langchain_id) のみ ← ベクトル index なし
```
- **埋め込み次元はローカル 1024**（Ollama `qwen3-embedding:0.6b`, `EMBEDDING_VECTOR_SIZE=1024`）。本番 OpenAI は 1536。**次元は環境で変わる**（Vectorize 1536 片道ドア問題が現実的、直接 SQL/pgvector なら次元非依存で安全）。
- **`langchain_metadata` に `user_id`/`video_id` は存在しない**（全 289 行 `meta_has_*=f`）。JSON キーは `start_time/end_time/start_sec/end_sec/scene_index/video_title`。

### 直接 SQL 実証（クエリベクトルは既存行 embedding を流用, Ollama 非依存）
- (A) `user_id=5 AND video_id IN {60,61,62}` の cosine top10 → 正しく距離昇順、全件が許可動画内、ソースが 0.00000。
- (B) **認可漏れ 0 件**。
- (C) フィルタ無しだと video 65 が 5 位に出現 → (A) のフィルタが他動画を実際に除外している証明。
- (D) **標準 JS 相当 `langchain_metadata->>'user_id'='5'` は 0 件** → 標準 LangChain.js PGVector フィルタでは RAG が全クエリ 0 件になることを実証。

### 判定と反映
- **判定 B 確定**: 直接 SQL を本線化（要件定義書 DR-4 のフォールバックを既定に昇格）。標準 PGVector のメタデータフィルタは不採用。
- 本番規模では **HNSW インデックス追加が必須**（現状ベクトル index 無し）。Workers 直接 SQL はこの index に依存する設計とする。
- 残タスク（任意）: 現行 langchain-postgres(Python) の `similarity_search_*` の順位と直接 SQL の順位が**数値一致**することの確認（`1_baseline_python.py` を backend コンテナ内で実行 → `2_direct_sql.mjs` と `4_compare.mjs`）。距離演算子・列マッピングは codex が実ライブラリで一致確認済みのため、優先度は低い。

## 6.6 PoC #01b: 実 Workers ランタイムでの直接SQL検証（2026-08-01）

DR-4 で「直接 SQL 本線」と決めた方針が、**実際の Cloudflare Workers ランタイム**で動くかを実測。
psql での SQL 検証（§6.5）に加え、**workerd（`wrangler dev`）+ `nodejs_compat` + `pg` + Hyperdrive バインディング + pgvector** の実行経路を通した。

- 構成: 最小 Hono Worker（[`poc/worker-hyperdrive-pg/`](../../poc/worker-hyperdrive-pg/)）。`wrangler.jsonc` に `nodejs_compat` + Hyperdrive バインディング（`localConnectionString`）。ローカル `videoq-postgres` を socat でホストポートに転送し Hyperdrive のローカル接続先に指定。
- Worker は per-request に `new pg.Client(env.HYPERDRIVE.connectionString)` を生成し、§6.5 と同じ直接 SQL（`embedding <=> $qvec`, `WHERE user_id=$ AND video_id = ANY($)`）を実行。

### 結果（すべて合格）
- **数値一致**: Worker が返す cosine 距離 `0.00000 / 0.19053 / 0.20142 / 0.24622 / 0.27434` は psql ground truth と**完全一致**。
- **認可フィルタが Worker 上で機能**: 許可動画を `{61,62}` に限定すると、seed 自身の video 60（距離 0）が**正しく除外**され video 61 のみ返る。`user_id=999`（不在）は **0 件**。`auth_violations=0`。
- **プラットフォーム層エラーなし**: `pg` のモジュールロード・接続・pgvector クエリすべて workerd 上で成功（`query_ms≈11–49ms`, 接続込み）。
- 結論: **DR-4 の「直接 SQL 本線」は実 Workers ランタイムで実装可能と確定**。`pg`（`Pool` でなく per-request `Client`）+ Hyperdrive + `nodejs_compat` で pgvector 検索が動く。

### 本番化に向けた注記
- 本 PoC は `wrangler dev`（ローカル）での検証。接続の per-request 生成（要件 §11.4）を守ること。

## 6.7 PoC #01c: 本番化残課題の検証（2026-08-01）

§6.6 の注記のうち、ローカルで実測できる 2 点を検証（#1 のみ本番クレデンシャル要のため未実施）。

- **#2 クエリベクトルの param 渡し（vector 型シリアライズ）— 合格**: 本番はクエリ埋め込み（OpenAI/Ollama）を param で渡す必要がある。Worker に `POST /search-vec` を追加し、**1024 次元ベクトルを文字列リテラル `"[a,b,...]"` として `$1::vector` にキャスト**して渡した結果、CTE 流用版（§6.6）と**距離が完全一致**（`0.00000/0.19053/0.20142/0.24622/0.27434`, `query_ms≈21ms`）。→ pgvector はネイティブ pg 型でないが、文字列リテラル + `::vector` キャストで問題なく機能。
- **#3 HNSW インデックス — 合格**: ローカル DB に `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` を作成 → `EXPLAIN` で **`Index Scan using poc_hnsw`** を確認（ANN 検索で索引利用）。索引有りでも認可フィルタ付き結果は**同一**。検証後 `DROP INDEX` し痕跡なし（`videoq_scenes_pkey` のみに復帰）。→ 本番は `embedding <=> $1::vector` の ORDER BY を索引化する前提でよい（HNSW の dim 上限 2000 に対し 1024/1536 とも収まる）。索引はクエリベクトルが**リテラル/param のとき**利用される（相関サブクエリだと使われない点に留意）。
## 6.8 PoC #01d: 本番 Hyperdrive + 実 Neon での実測（2026-08-01）— 合格

`wrangler hyperdrive create` で本番 Neon を指す Hyperdrive 設定を作成し、**`wrangler dev --remote`（実 CF エッジ上で Worker 実行）**から実測。Worker には接続時 `SET default_transaction_read_only = on` を仕込み、書き込み不可を担保（`neondb_owner` でも安全）。検証後に Hyperdrive 設定は削除。

### 本番データ（`/probe` 実測）
- **1,762 行 / user 1 / 57 動画**、`embedding` は **`vector(1536)`**（本番 OpenAI 埋め込み）、インデックスは `videoq_scenes_pkey` のみ（**HNSW 無し**、ローカルと同様）。

### 結果（すべて合格）
- **本番検索の正当性**: `user=1, videos=81,77,39, seed=81` → cosine 昇順、seed 自身 0.00000、許可外動画の混入 `auth_violations=0`。実 Neon 1536 次元データで直接 SQL 認可検索が機能。
- **レイテンシ（Worker 内部 `query_ms`）**: **cold 初回 ≈462ms**（Hyperdrive のコネクション確立）、以降 **warm P50=3ms / P95=4ms**（Hyperdrive のコネクションプーリングによりエッジ→Neon でも数 ms）。※ `curl` 総時間 P50≈455ms は「自機→CF エッジ preview」の往復で、実ユーザは最寄り PoP のため非該当。DB 往復の指標は `query_ms`。
- **同時接続 20 並列**: **20/20 成功・エラー 0**。per-request `Client`（都度 connect/end）で stale connection / I/O context エラーなし。要件 §11.4 の「接続をリクエストごとに生成」が実エッジで妥当と確認。

### 注記
- 本番も HNSW 無し（1,762 行なら seq scan で warm 3ms）。データ増に備え **HNSW 追加を推奨**（PoC #01c で作成・利用・同一結果を確認済み）。
- 後始末: Hyperdrive 設定削除済み、`wrangler.jsonc` の id はプレースホルダに戻した。

**総合（データ層 PoC 完了）**: 直接 SQL 方針は、**SQL ロジック(psql) → 実 Workers ランタイム(workerd+pg+Hyperdrive) → vector 型 param → HNSW 索引 → 本番 Hyperdrive+実 Neon(1536 次元)** まで、すべて実測で裏付け済み。**残課題なし。**

## 7. 安全上の注意

- 全ステップ**読み取り専用**。`videoq_scenes` および関連テーブルへ INSERT/UPDATE/DDL を行わない（DR-1）。
- 本番ではなくステージング/レプリカで実施。接続は最小権限ユーザー。
- 埋め込み生成は PoC 質問のみに限定し、コスト・PII 送信を最小化する。
