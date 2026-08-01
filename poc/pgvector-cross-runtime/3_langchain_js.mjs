// PoC #01 Step 4 — LangChain.js 標準 PGVector での再現（互換性検証, READ-ONLY）
//
// 目的: 標準 PGVectorStore が現行スキーマ（user_id/video_id が独立列）で
//       現行と同じフィルタ検索を再現できるか確認する。
// 予測: 標準 buildFilterClauses() は langchain_metadata ->> 'user_id' に
//       フィルタを掛けるため、独立列に値がある現行では 0 件 or 誤結果に
//       なる可能性が高い（DR-4）。その事実を実測で確定するためのスクリプト。
//
// 使い方:
//   npm i pg @langchain/community @langchain/openai @langchain/core
//   DATABASE_URL="postgresql://READONLY_USER:...@host/db?sslmode=require" \
//   OPENAI_API_KEY="sk-..." \
//   node 3_langchain_js.mjs \
//     --config config.json \
//     --emb out/query_embeddings.json \
//     --out out/langchain_js.json
//
// 注意: SELECT のみ。skipInitializationCheck を必ず true にし、テーブル自動作成を防ぐ。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";

const sha256 = (s) => createHash("sha256").update(s ?? "", "utf-8").digest("hex");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const cfg = JSON.parse(readFileSync(arg("config", "config.json"), "utf-8"));
const embs = JSON.parse(readFileSync(arg("emb", "out/query_embeddings.json"), "utf-8"));
const outPath = arg("out", "out/langchain_js.json");
const k = cfg.k ?? 20;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const store = await PGVectorStore.initialize(
  new OpenAIEmbeddings({ model: process.env.EMBEDDING_MODEL || "text-embedding-3-small" }),
  {
    pool,
    schemaName: "public",
    tableName: "videoq_scenes",
    columns: {
      idColumnName: "langchain_id",
      contentColumnName: "content",
      vectorColumnName: "embedding",
      metadataColumnName: "langchain_metadata",
    },
    distanceStrategy: "cosine",
    // 既存テーブルを触らない（自動作成/DDL 抑止）
    skipInitializationCheck: true,
  }
);

const results = [];
for (const { query, embedding } of embs) {
  // Python と同一ベクトルを使い、埋め込み差を排除
  let rows = [];
  let error = null;
  try {
    // 標準フィルタ: JSON メタに掛かる（現行スキーマと非互換の可能性）
    const docs = await store.similaritySearchVectorWithScore(embedding, k, {
      user_id: cfg.user_id,
      video_id: { in: cfg.video_ids },
    });
    rows = docs.map(([doc, score]) => ({
      id: doc.id ?? null,
      content_sha256: sha256(doc.pageContent),
      score: Number(score),
      user_id: doc.metadata?.user_id ?? null,
      video_id: doc.metadata?.video_id ?? null,
      start_sec: doc.metadata?.start_sec ?? null,
      content_head: (doc.pageContent ?? "").slice(0, 80),
    }));
  } catch (e) {
    error = String(e?.message ?? e);
  }
  results.push({ query, k, error, results: rows });
  console.log(`[langchain-js] '${query.slice(0, 24)}...' -> ${error ? "ERROR: " + error : rows.length + " hits"}`);
}

// initialize() が pool.connect() した client を保持するため、pool.end() ではなく
// store.end() で client を release してから終了する（ハング/リーク回避）。
await store.end();
await pool.end();

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ results }, null, 2), "utf-8");
console.log(`[langchain-js] wrote -> ${outPath}`);
