// modern scene_embeddings に対する直接 SQL 検索（READ-ONLY）。
// query_embeddings.json のベクトルを使い、cosine 距離と EXPLAIN を採取する。
//
// 使い方:
//   npm i pg
//   DATABASE_URL="postgresql://READONLY_USER:...@host/db?sslmode=require" \
//   node 2_direct_sql.mjs \
//     --config config.json \
//     --emb out/query_embeddings.json \
//     --out out/direct_sql.json
//
// 注意: 本 PoC は SELECT のみ。書き込み・DDL は行わない。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

const sha256 = (s) => createHash("sha256").update(s ?? "", "utf-8").digest("hex");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const cfg = JSON.parse(readFileSync(arg("config", "config.json"), "utf-8"));
const embs = JSON.parse(readFileSync(arg("emb", "out/query_embeddings.json"), "utf-8"));
const outPath = arg("out", "out/direct_sql.json");
const k = cfg.k ?? 20;
const userId = cfg.user_id;
const videoIds = cfg.video_ids;

// public スキーマを明示して search_path 依存を避ける。
// <=> は cosine distance（小さいほど近い）。
const SQL = `
  SELECT id, content, langchain_metadata, user_id, video_id,
         embedding <=> $1::vector AS distance
  FROM public.scene_embeddings
  WHERE user_id = $2
    AND video_id = ANY($3::bigint[])
  ORDER BY embedding <=> $1::vector
  LIMIT $4;
`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const results = [];
let explainCaptured = null;

for (const { query, embedding } of embs) {
  const vec = `[${embedding.join(",")}]`; // pgvector リテラル
  const { rows } = await client.query(SQL, [vec, userId, videoIds, k]);
  results.push({
    query,
    k,
    results: rows.map((r) => ({
      id: r.id,
      content_sha256: sha256(r.content),
      score: Number(r.distance),
      user_id: r.user_id,
      video_id: r.video_id,
      start_sec: r.langchain_metadata?.start_sec ?? null,
      content_head: (r.content ?? "").slice(0, 80),
    })),
  });
  if (!explainCaptured) {
    const ex = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${SQL}`,
      [vec, userId, videoIds, k]
    );
    explainCaptured = ex.rows.map((x) => x["QUERY PLAN"]).join("\n");
  }
  console.log(`[direct-sql] '${query.slice(0, 24)}...' -> ${rows.length} hits`);
}

await client.end();

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ results, explain: explainCaptured }, null, 2), "utf-8");
console.log(`[direct-sql] wrote -> ${outPath}`);
console.log("\n[direct-sql] EXPLAIN (first query):\n" + explainCaptured);
