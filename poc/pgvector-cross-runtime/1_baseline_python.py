#!/usr/bin/env python
"""PoC #01 Step 2 — Python golden baseline (READ-ONLY).

現行 RAG と厳密に同じ埋め込み・検索設定（距離・列マッピング・filter）で上位 k 件を
採取し、比較の基準（ゴールデン）として JSON 出力する。**書き込み・DDL は行わない**。

READ-ONLY 保証のため、`PGVectorManager.create_vectorstore()`（= `ensure_table()` で
CREATE EXTENSION / CREATE TABLE を発行する）は使わず、同じ検索設定のまま
`PGVectorStore.create_sync()` を DDL なしで直接生成する（init_vectorstore_table を呼ばない）。

使い方（backend/ の venv で。Django アプリと同じ設定を import するため）:

    cd backend
    DJANGO_SETTINGS_MODULE=videoq.settings \
    DATABASE_URL="postgresql://READONLY_USER:...@host/db?sslmode=require" \
    OPENAI_API_KEY="sk-..." \
    .venv/bin/python ../poc/pgvector-cross-runtime/1_baseline_python.py \
        --config ../poc/pgvector-cross-runtime/config.json \
        --out ../poc/pgvector-cross-runtime/out/python_golden.json \
        --emb-out ../poc/pgvector-cross-runtime/out/query_embeddings.json

`query_embeddings.json` は Step 3/4（JS 側）で「同一ベクトル」を使い回し、
埋め込み差と検索差を切り分けるために出力する。

※ backend を Ollama 運用している場合は EMBEDDING_PROVIDER / EMBEDDING_MODEL /
  OLLAMA_BASE_URL も実環境と同一に設定すること（get_embeddings がそれらに従う）。
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

# このスクリプトはリポジトリの poc/ 配下にあるため、backend/ を import path へ明示追加する
# （スクリプト自身のディレクトリが sys.path[0] になり "videoq" を解決できない問題を回避）。
_BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import django  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--emb-out", required=True)
    args = parser.parse_args()

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "videoq.settings")
    django.setup()

    from langchain_postgres import PGVectorStore

    from app.infrastructure.common.embeddings import get_embeddings
    from app.infrastructure.external.vector_store import PGVectorManager

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    user_id = int(cfg["user_id"])
    video_ids = [int(v) for v in cfg["video_ids"]]
    queries = list(cfg["queries"])
    k = int(cfg.get("k", 20))

    embeddings = get_embeddings()  # 実 RAG と同一（EMBEDDING_MODEL）

    # 実 RAG（PGVectorManager.create_vectorstore）と同一の検索設定を、DDL なしで再現する。
    # metadata_columns=["user_id","video_id"] / 既定 id 列 langchain_id / 既定 COSINE_DISTANCE。
    store = PGVectorStore.create_sync(
        engine=PGVectorManager.get_engine(),
        embedding_service=embeddings,
        table_name=PGVectorManager.get_table_name(),
        metadata_columns=["user_id", "video_id"],
    )

    if not hasattr(store, "similarity_search_with_score_by_vector"):
        raise SystemExit(
            "similarity_search_with_score_by_vector が存在しません。"
            "インストール済み langchain-postgres のバージョンを確認してください。"
        )

    results = []
    emb_dump = []
    null_ids = 0
    for q in queries:
        # 質問ベクトルを 1 回だけ生成し、JS 側でも同一ベクトルを使えるよう出力
        qvec = embeddings.embed_query(q)
        emb_dump.append({"query": q, "embedding": qvec})

        flt = {"user_id": user_id, "video_id": {"$in": video_ids}}
        # 同一ベクトルで検索（text 再埋め込みへの暗黙 fallback はしない = 埋め込み差を排除）
        docs = store.similarity_search_with_score_by_vector(
            embedding=qvec, k=k, filter=flt
        )

        rows = []
        for doc, score in docs:
            md = getattr(doc, "metadata", {}) or {}
            content = getattr(doc, "page_content", "") or ""
            doc_id = getattr(doc, "id", None)
            if doc_id is None:
                null_ids += 1
            rows.append({
                "id": doc_id,
                "content_sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
                "score": float(score),
                "user_id": md.get("user_id"),
                "video_id": md.get("video_id"),
                "start_sec": md.get("start_sec"),
                "content_head": content[:80],
            })
        results.append({"query": q, "k": k, "results": rows})
        print(f"[python] '{q[:24]}...' -> {len(rows)} hits")

    if null_ids:
        print(f"[python][WARN] id(langchain_id) が null の結果が {null_ids} 件。"
              " 比較は content_sha256 を代理キーに使用します。")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    emb_path = Path(args.emb_out)
    emb_path.parent.mkdir(parents=True, exist_ok=True)
    emb_path.write_text(json.dumps(emb_dump, ensure_ascii=False), encoding="utf-8")

    print(f"[python] wrote golden -> {out_path}")
    print(f"[python] wrote query embeddings -> {emb_path}")


if __name__ == "__main__":
    main()
