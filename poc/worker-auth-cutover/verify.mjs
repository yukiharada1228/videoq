// PoC #03 — Worker 相当（jose + WebCrypto）で Django 発行物を検証。
// jose / crypto.subtle は Cloudflare Workers ネイティブ（同一 SubtleCrypto）。ここでは
// Node で実行するが、workerd 上でも同一に動く（HMAC-SHA256 / SHA-256 は標準 WebCrypto）。
//
// 使い方:
//   DJANGO_SECRET_KEY="<settings.SECRET_KEY>" node verify.mjs
//   （SECRET_KEY は env 経由。標準出力には出さない）

import { readFileSync } from "node:fs";
import { jwtVerify } from "jose";

const data = JSON.parse(readFileSync("/tmp/poc03.json", "utf-8"));
const secret = process.env.DJANGO_SECRET_KEY;
if (!secret) {
  console.error("DJANGO_SECRET_KEY env is required");
  process.exit(2);
}

let pass = true;

// --- 1) JWT: Django の access token を Worker(jose) が HS256 + SECRET_KEY で検証 ---
try {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(data.access_token, key, { algorithms: ["HS256"] });
  const okUser = payload.user_id === data.user_id;
  const okType = payload.token_type === "access"; // SimpleJWT の access 種別を Worker 側でも必須化
  const okExp = typeof payload.exp === "number";
  console.log(`[JWT] verified ✓  user_id=${payload.user_id} token_type=${payload.token_type} exp=${okExp}`);
  if (!(okUser && okType && okExp)) { pass = false; console.log("[JWT] claim mismatch"); }
} catch (e) {
  pass = false;
  console.log("[JWT] verify FAILED:", String(e?.message ?? e));
}

// --- 1b) 改ざん検知: SECRET_KEY 不一致だと拒否されること ---
try {
  await jwtVerify(data.access_token, new TextEncoder().encode(secret + "x"), { algorithms: ["HS256"] });
  pass = false;
  console.log("[JWT] SECURITY FAIL: wrong-secret token was accepted");
} catch {
  console.log("[JWT] wrong-secret correctly rejected ✓");
}

// --- 2) API キー: WebCrypto SHA-256 が Django の hashlib.sha256 hexdigest と一致 ---
const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.api_key));
const hashJs = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const okHash = hashJs === data.api_key_hash_py;
console.log(`[APIKEY] webcrypto sha256 == django hash: ${okHash ? "✓" : "✗"}`);
if (!okHash) { pass = false; console.log(`  js=${hashJs.slice(0,16)}...  py=${data.api_key_hash_py.slice(0,16)}...`); }

console.log("\nRESULT:", pass ? "PASS ✅ — Worker は Django 発行の JWT / API キーを同一検証（カットオーバーで既存セッション維持）" : "FAIL ❌");
process.exit(pass ? 0 : 1);
