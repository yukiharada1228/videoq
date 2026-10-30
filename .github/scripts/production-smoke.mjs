import { createRequire } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(new URL('../operations-tools/package.json', import.meta.url));
const { Client } = require('pg');
const { chromium } = require('playwright');
const { hashPassword } = await import(require.resolve('better-auth/crypto'));
const { ORIGIN, synthetic, uploadAllowed, completed, deletable, fixtureValid, waitForCleanup, citedAnswerValid } = createRequire(import.meta.url)('./production-smoke-policy.cjs');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000,
  statement_timeout: 30_000, application_name: 'videoq-operations-smoke' });
const verifyAi = process.env.VERIFY_AI_ANSWERS === 'true';
let browser, currentUser, cookie = '', stage = 'public-health';
function progress(value) { stage = value; console.log('Production smoke stage: ' + value); }
const request = (path, options = {}) => fetch(ORIGIN + path, { ...options, redirect: 'error', signal: options.signal ?? AbortSignal.timeout(30_000) });
async function rpc(procedure, input, mutation = false, timeoutMs = 30_000) {
  const response = await request('/api/trpc/' + procedure + (mutation ? '' : '?input=' + encodeURIComponent(JSON.stringify(input))), {
    signal: AbortSignal.timeout(timeoutMs), method: mutation ? 'POST' : 'GET', headers: { cookie, Origin: ORIGIN, 'Content-Type': 'application/json' },
    ...(mutation ? { body: JSON.stringify(input) } : {}),
  });
  const value = await response.json();
  if (!response.ok || !value.result || value.error) throw new Error('RPC failed');
  return value.result.data;
}
async function login(user, password) {
  if (!synthetic(user)) throw new Error('Unsafe synthetic identity');
  const response = await request('/api/auth/sign-in/email', { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password }),
  });
  if (!response.ok) throw new Error('Synthetic sign-in failed');
  cookie = response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
  if (!cookie.includes('session_token=')) throw new Error('No signed session');
  await db.query("UPDATE session SET expires_at = LEAST(expires_at, now() + interval '1 hour') WHERE user_id = $1", [user.id]);
}
async function cleanup(user) {
  if (!synthetic(user)) throw new Error('Unsafe cleanup target');
  const { rows } = await db.query('SELECT id, status FROM videos WHERE user_id = $1', [user.id]);
  // Do not race a running worker or orphan its uploads. A later run retries terminal videos.
  if (rows.some(video => !deletable(video.status))) return false;
  const visual = await db.query(`SELECT count(*) FROM video_visual_runs r JOIN videos v ON v.id = r.video_id
    WHERE v.user_id = $1 AND r.status = 'processing'`, [user.id]);
  if (Number(visual.rows[0].count)) return false;
  for (const video of rows) await rpc('videos.delete', { id: Number(video.id) }, true);
  const pending = await db.query(`SELECT count(*) FROM external_tasks WHERE kind = 'storage_cleanup'
    AND payload->>'user_id' = $1 AND completed_at IS NULL`, [user.id]);
  if (Number(pending.rows[0].count)) return false;
  const courses = await db.query('SELECT id FROM video_courses WHERE user_id = $1', [user.id]);
  for (const course of courses.rows) await rpc('courses.delete', { id: Number(course.id) }, true);
  const removed = await db.query(`DELETE FROM users WHERE id = $1 AND username = $2 AND email = $3
    AND name = $4 AND role = 'user' AND quota_source = 'admin'
    AND NOT EXISTS (SELECT 1 FROM videos WHERE user_id = $1) RETURNING id`,
  [user.id, user.username, user.email, user.name]);
  return removed.rowCount === 1;
}
let report = { status: 'error', summary: '本番の動作確認を完了できませんでした。', details: [] };
try {
  for (const path of ['/health', '/ready']) {
    const response = await request(path);
    const body = await response.json();
    if (!response.ok || !['ok', 'ready'].includes(body.data?.status) || (path === '/ready' && body.data.db !== 'ok')) throw new Error('Health failed');
  }
  progress('database-and-cleanup');
  await db.connect();
  const old = await db.query(`SELECT id, username, email, name, role, quota_source FROM users
    WHERE username = 'ops_smoke_' || id AND email = id || '@example.invalid'
      AND name = 'VideoQ automated smoke check' AND role = 'user' AND quota_source = 'admin'
    ORDER BY created_at LIMIT 10`);
  for (const user of old.rows) {
    if (!synthetic(user)) continue;
    const password = randomBytes(32).toString('base64url');
    const hash = await hashPassword(password);
    await db.query("UPDATE account SET password = $1 WHERE user_id = $2 AND provider_id = 'credential'", [hash, user.id]);
    await login(user, password);
    if (!await waitForCleanup(() => cleanup(user), delay)) throw new Error('Earlier smoke video still processing; no additional upload');
  }
  const id = randomUUID();
  const password = randomBytes(32).toString('base64url');
  currentUser = { id, username: 'ops_smoke_' + id, email: id + '@example.invalid',
    name: 'VideoQ automated smoke check', role: 'user', quota_source: 'admin' };
  const hash = await hashPassword(password);
  await db.query('BEGIN');
  await db.query(`INSERT INTO users (id, username, email, name, role, email_verified, password_reset_required,
    is_over_quota, used_ai_answers, used_processing_seconds, used_storage_bytes, quota_source,
    processing_limit_minutes, ai_answers_limit, storage_limit_gb, monthly_upload_limit_gb)
    VALUES ($1,$2,$3,$4,'user',true,false,false,0,0,0,'admin',1,$5,0.01,0.01)`,
  [id, currentUser.username, currentUser.email, currentUser.name, verifyAi ? 1 : 0]);
  await db.query("INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ($1,$2,'credential',$2,$3)", [randomUUID(), id, hash]);
  await db.query('COMMIT');
  progress('synthetic-sign-in');
  await login(currentUser, password);
  progress('upload');
  const bytes = await fs.readFile(new URL('../operations-tools/fixtures/smoke.mp4', import.meta.url));
  if (!fixtureValid(bytes)) throw new Error('Unreviewed fixture');
  const title = 'Operations smoke ' + id;
  const upload = await rpc('videos.requestUpload', { filename: 'operations-smoke.mp4', title,
    description: 'Automated short-lived operations check', contentType: 'video/mp4', fileSize: bytes.length }, true);
  if (!uploadAllowed(upload.upload_url)) throw new Error('Unexpected upload origin');
  const put = await fetch(upload.upload_url, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'video/mp4' },
    redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!put.ok) throw new Error('Upload failed');
  await rpc('videos.confirmUpload', { id: upload.video.id }, true);
  progress('video-processing');
  let video;
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    video = await rpc('videos.get', { id: upload.video.id });
    if (video.visual_processing?.status === 'error') throw new Error('Visual processing failed');
    if (completed(video)) break;
    if (video.status === 'error') throw new Error('Processing failed');
    await delay(Math.min(20_000, Math.max(0, deadline - Date.now())));
  }
  if (!video || !completed(video) || !video.transcript?.trim()) throw new Error('Video processing did not finish');
  const embedded = await db.query('SELECT count(*) FROM scene_embeddings WHERE user_id = $1 AND video_id = $2', [id, video.id]);
  if (Number(embedded.rows[0].count) < 1) throw new Error('No scene embeddings');
  if (verifyAi) {
    progress('cited-question-answer');
    const course = await rpc('courses.create', { name: title, description: 'Temporary migration verification' }, true);
    await rpc('memberships.addVideo', { courseId: course.id, videoId: video.id }, true);
    const answer = await rpc('chat.send', { courseId: course.id,
      messages: [{ role: 'user', content: 'What is said in this video? Summarize it and cite the transcript evidence.' }] }, true, 180_000);
    if (!citedAnswerValid(answer, Number(video.id))) throw new Error('No cited answer from the uploaded video');
  }
  progress('browser');
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', () => errors.push(true));
  const publicPage = await page.goto(ORIGIN + '/login', { waitUntil: 'networkidle', timeout: 60_000 });
  if (!publicPage.ok() || await page.locator('input[name="username"]').count() !== 1 ||
      await page.locator('input[name="password"]').count() !== 1) throw new Error('Login UI failed');
  await context.addCookies(cookie.split('; ').map(value => {
    const at = value.indexOf('=');
    return { name: value.slice(0, at), value: value.slice(at + 1), url: ORIGIN, httpOnly: true, secure: true, sameSite: 'Lax' };
  }));
  await page.goto(ORIGIN + '/videos', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText(title, { exact: true }).first().waitFor({ timeout: 30_000 });
  if (errors.length) throw new Error('Browser JavaScript error');
  report = { status: 'ok', summary: '本番の画面・API・DB・短い動画の処理・文字起こし・埋め込みを確認しました。' + (verifyAi ? ' 検索と引用付き Q&A も確認しました。' : ''), details: [] };
} catch {
  try { await db.query('ROLLBACK'); } catch { /* connection may be unavailable */ }
  report.details = ['- 失敗した段階: `' + stage + '`。認証情報や利用者のデータはログに出力していません。'];
} finally {
  console.log('Production smoke checks: ' + report.status);
  if (browser) await browser.close().catch(() => {});
  if (currentUser) {
    try {
      if (!await waitForCleanup(() => cleanup(currentUser), delay)) throw new Error('Cleanup pending');
      console.log('Production smoke cleanup: complete');
    } catch {
      console.log('Production smoke cleanup: incomplete');
      report.status = 'error';
      report.summary = '本番の動作確認またはテストデータの削除を完了できませんでした。';
      report.details.push('- テストデータが残っています。次回の実行で再確認し、処理中の動画は削除しません。');
    }
  }
  await db.end().catch(() => {});
  await fs.writeFile('operations-report.json', JSON.stringify(report));
}
