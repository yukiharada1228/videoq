// Explicitly opt into a disposable, fully migrated DB; no AI or storage calls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));

const databaseURL = process.env.ONPREM_SMOKE_DATABASE_URL;
assert(databaseURL, "ONPREM_SMOKE_DATABASE_URL must point to a disposable migrated DB");
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const image = process.argv[2];
const settings = {
  PORT: String(port), DATABASE_URL: (image && process.env.ONPREM_SMOKE_CONTAINER_DATABASE_URL) || databaseURL,
  BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  USER_SECRET_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
  R2_ACCESS_KEY_ID: "smoke", R2_SECRET_ACCESS_KEY: "smoke", R2_BUCKET_NAME: "smoke",
  R2_S3_ENDPOINT: "http://127.0.0.1:9", SQS_QUEUE_URL: "http://127.0.0.1:9/smoke",
  AWS_ACCESS_KEY_ID: "smoke", AWS_SECRET_ACCESS_KEY: "smoke",
  OPENAI_API_KEY: "", MAILGUN_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
  STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", TRUST_PROXY_HOPS: "0",
  DATABASE_POOL_MAX: "2", RATE_LIMIT_POOL_MAX: "1",
};
const env = { ...process.env, ...settings };
const network = process.env.ONPREM_SMOKE_DOCKER_NETWORK || "host";
assert(["host", "bridge"].includes(network), "Docker smoke network must be host or bridge");
const containerArgs = ["run", "--rm", "--network", network,
  ...Object.keys(settings).flatMap(key => ["--env", key])];
const args = image
  ? [...containerArgs, ...(network === "bridge" ? ["--publish", `127.0.0.1:${port}:${port}`] : []), image]
  : ["dist/node.mjs"];
// Fail before starting a child if the disposable fixture is unavailable.
const db = new pg.Client({ connectionString: databaseURL });
await db.connect();
const child = spawn(image ? "docker" : process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
const closed = once(child, "close");
let logs = "";
child.stdout.on("data", data => { logs += data; });
child.stderr.on("data", data => { logs += data; });
const email = `onprem-smoke-${randomUUID()}@example.invalid`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Node API exited before readiness");
    try { ready = (await fetch(`${origin}/ready`)).ok; } catch { /* startup */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(ready, "Node API did not become ready");
  assert.equal((await fetch(`${origin}/health`)).status, 200);
  assert.equal((await fetch(`${origin}/api/auth/get-session`)).status, 200);
  for (const path of ["/api/chat/messages/stream", "/api/trpc/chat.send"]) {
    const response = await fetch(`${origin}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "What is this course about?" }], courseId: 1 }),
    });
    assert.equal(response.status, 401, `${path} must retain authentication on Node`);
  }
  const signup = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ name: "On-prem Smoke", email, password: "Onprem-smoke-password-2026!",
      username: `smoke_${randomBytes(6).toString("hex")}` }),
  });
  assert.equal(signup.status, 200, `signup failed: ${await signup.text()}`);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM users WHERE email = $1", [email])).rows[0].count, 1);
  assert((await db.query("SELECT count(*)::int AS count FROM runtime_rate_limits")).rows[0].count > 0);
  const concurrentAuth = await Promise.all(Array.from({ length: 8 }, () => fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email: "missing-onprem@example.invalid", password: "invalid-password" }),
    signal: AbortSignal.timeout(15_000),
  })));
  assert(concurrentAuth.every(response => [401, 403, 429].includes(response.status)),
    "Concurrent authentication must complete without exhausting the DB pool");
  for (const command of ["maintenance", "retention"]) {
    const job = spawn(image ? "docker" : process.execPath,
      image ? [...containerArgs, image, "node", "dist/node.mjs", command] : ["dist/node.mjs", command],
      { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    job.stdout.on("data", data => { logs += data; });
    job.stderr.on("data", data => { logs += data; });
    const [code] = await once(job, "close");
    assert.equal(code, 0, `${command} must run without Cloudflare bindings`);
  }
  console.log("Node HTTP smoke passed: readiness, auth, chat guards, signup and PostgreSQL rate limiting");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  child.kill("SIGTERM");
  const deadline = setTimeout(() => child.kill("SIGKILL"), 10_000);
  const [code] = await closed;
  clearTimeout(deadline);
  await db.query("DELETE FROM users WHERE email = $1", [email]);
  await db.end();
  assert.equal(code, 0, "Node runtime must exit cleanly after SIGTERM");
}
