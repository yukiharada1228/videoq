// 直接 SQL の基準結果と候補の上位結果を比較し、PASS/FAIL を出す。
//
// 使い方:
//   node 4_compare.mjs \
//     --golden out/direct_sql.json \
//     --candidate out/langchain_js.json \
//     --config config.json \
//     --label direct-sql

import { readFileSync } from "node:fs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const goldenRaw = JSON.parse(readFileSync(arg("golden", "out/direct_sql.json"), "utf-8"));
const candRaw = JSON.parse(readFileSync(arg("candidate", "out/direct_sql.json"), "utf-8"));
const cfg = JSON.parse(readFileSync(arg("config", "config.json"), "utf-8"));
const label = arg("label", "candidate");
const golden = Array.isArray(goldenRaw) ? goldenRaw : goldenRaw.results;
const candidate = Array.isArray(candRaw) ? candRaw : candRaw.results;

// 安定キー: scene_embeddings.id を最優先、無ければ content hash。
const keyOf = (r) =>
  r.id != null
    ? `id:${r.id}`
    : r.content_sha256
    ? `sha:${r.content_sha256}`
    : `k:${r.video_id}|${r.start_sec}|${(r.content_head || "").slice(0, 24)}`;

function spearman(goldKeys, candKeys) {
  // gold と cand の「共通要素だけ」を取り出し、共通集合内で順位を振り直してから
  // Spearman を計算する（欠落要素があっても正しい順位相関になるように）。
  const candRankAll = new Map(candKeys.map((k, i) => [k, i]));
  const common = goldKeys.filter((k) => candRankAll.has(k)); // gold 順の共通要素
  const n = common.length;
  if (n < 2) return n === 1 ? 1 : null;
  const goldRank = new Map(common.map((k, i) => [k, i])); // 共通集合内の gold 順位
  const candCommonOrder = candKeys.filter((k) => goldRank.has(k)); // 共通要素の cand 順
  const candRank = new Map(candCommonOrder.map((k, i) => [k, i]));
  let d2 = 0;
  for (const k of common) d2 += (goldRank.get(k) - candRank.get(k)) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

const TOPN = 10;
let overallPass = true;
const perQuery = [];

for (const g of golden) {
  const c = candidate.find((x) => x.query === g.query) || { results: [], error: null };
  const gTop = g.results.slice(0, TOPN).map(keyOf);
  const cTop = (c.results || []).slice(0, TOPN).map(keyOf);
  const gSet = new Set(gTop);
  const cSet = new Set(cTop);
  const inter = [...gSet].filter((k) => cSet.has(k));
  const union = new Set([...gSet, ...cSet]);
  const jaccard = union.size ? inter.length / union.size : 0;
  const overlap = gSet.size ? inter.length / gSet.size : 0; // gold を基準にした一致率
  const rho = spearman(gTop, cTop);

  // 認可漏れ検査（候補側の全結果）
  const authViolations = (c.results || []).filter(
    (r) => r.user_id !== cfg.user_id || !cfg.video_ids.includes(r.video_id)
  ).length;

  // 距離: 共通 ID の相対誤差の最大（score 意味が両者で異なりうる点は注記）
  const gScore = new Map(g.results.map((r) => [keyOf(r), r.score]));
  let maxRelErr = 0;
  for (const r of c.results || []) {
    const gk = keyOf(r);
    if (gScore.has(gk)) {
      const a = gScore.get(gk), b = r.score;
      const denom = Math.max(Math.abs(a), 1e-9);
      maxRelErr = Math.max(maxRelErr, Math.abs(a - b) / denom);
    }
  }

  // 一次判定: ID 集合一致率・順位相関・認可漏れ・エラー無し。
  const pass =
    !c.error && overlap >= 0.9 && (rho == null || rho >= 0.9) && authViolations === 0;
  if (!pass) overallPass = false;
  // 距離は参考（score 意味論が実装間で異なりうる）。direct-sql では 1e-4 超で要調査。
  const distanceWarn = maxRelErr > 1e-4;

  perQuery.push({ query: g.query.slice(0, 30), error: c.error || null, overlap: +overlap.toFixed(3), jaccard: +jaccard.toFixed(3), spearman: rho == null ? null : +rho.toFixed(3), authViolations, maxScoreRelErr: +maxRelErr.toFixed(6), distanceWarn, pass });
}

console.log(`\n=== PoC #01 比較結果: golden vs ${label} ===`);
console.table(perQuery);
console.log(`\n総合判定: ${overallPass ? "PASS ✅" : "FAIL ❌"}`);
console.log("合格基準: overlap(top10)>=0.9, spearman>=0.9, authViolations=0, error=none");
console.log("※ wrapper により score の意味が異なる場合があるため、maxScoreRelErr は参考値。");
process.exit(overallPass ? 0 : 1);
