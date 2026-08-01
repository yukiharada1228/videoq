import { Hono } from "hono";
import pg from "pg";

type Bindings = { HYPERDRIVE: { connectionString: string } };

const app = new Hono<{ Bindings: Bindings }>();

// 直接SQL版 pgvector 検索（要件定義書 DR-4 本線）。
// クエリベクトルは seed 動画の既存 embedding を CTE で流用（vector 型パラメータの
// マーシャリングを避けるため）。認可フィルタ user_id / video_id は独立列で行う。
app.get("/search", async (c) => {
  const user = Number(c.req.query("user") ?? 5);
  const videos = (c.req.query("videos") ?? "60,61,62").split(",").map(Number);
  const seed = Number(c.req.query("seed") ?? 60);
  const k = Number(c.req.query("k") ?? 5);

  const client = new pg.Client({ connectionString: c.env.HYPERDRIVE.connectionString });
  await client.connect();
  // 安全装置: セッションを読み取り専用に固定（neondb_owner 等の書込権があっても書込不可）
  await client.query("SET default_transaction_read_only = on");
  try {
    const sql = `
      WITH q AS (
        SELECT embedding AS qvec FROM public.videoq_scenes
        WHERE video_id = $1 ORDER BY langchain_id LIMIT 1
      )
      SELECT s.langchain_id,
             s.video_id,
             round((s.embedding <=> q.qvec)::numeric, 5) AS dist
      FROM public.videoq_scenes s, q
      WHERE s.user_id = $2 AND s.video_id = ANY($3::int[])
      ORDER BY s.embedding <=> q.qvec
      LIMIT $4;`;
    const values = [seed, user, videos, k];
    const started = Date.now();
    const { rows } = await client.query(sql, values);
    const ms = Date.now() - started;
    const authViolations = rows.filter(
      (r: any) => r.video_id !== null && !videos.includes(r.video_id)
    ).length;
    return c.json({
      ok: true,
      runtime: "workerd (wrangler dev) + nodejs_compat + pg + Hyperdrive",
      params: { user, videos, seed, k },
      query_ms: ms,
      auth_violations: authViolations,
      rows,
    });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  } finally {
    await client.end();
  }
});

// 本番相当: クエリベクトル（OpenAI 埋め込み想定）を param として渡す経路の検証。
// pgvector の vector 型は pg のネイティブ型でないため、文字列リテラル "[a,b,...]" を
// 渡して $1::vector にキャストする。CTE 流用版（GET /search）と同一結果になるかを確認する。
app.post("/search-vec", async (c) => {
  const body = await c.req.json<{ qvec: number[]; user?: number; videos?: number[]; k?: number }>();
  const user = Number(body.user ?? 5);
  const videos = (body.videos ?? [60, 61, 62]).map(Number);
  const k = Number(body.k ?? 5);
  const vecLiteral = `[${body.qvec.join(",")}]`;

  const client = new pg.Client({ connectionString: c.env.HYPERDRIVE.connectionString });
  await client.connect();
  // 安全装置: セッションを読み取り専用に固定（neondb_owner 等の書込権があっても書込不可）
  await client.query("SET default_transaction_read_only = on");
  try {
    const sql = `
      SELECT s.langchain_id, s.video_id,
             round((s.embedding <=> $1::vector)::numeric, 5) AS dist
      FROM public.videoq_scenes s
      WHERE s.user_id = $2 AND s.video_id = ANY($3::int[])
      ORDER BY s.embedding <=> $1::vector
      LIMIT $4;`;
    const started = Date.now();
    const { rows } = await client.query(sql, [vecLiteral, user, videos, k]);
    return c.json({ ok: true, dim: body.qvec.length, query_ms: Date.now() - started, rows });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  } finally {
    await client.end();
  }
});

// PoC #04: quota 予約（Django check_and_reserve_storage の単一・原子的な条件付き UPDATE を
// 生 SQL で再現）。並行時に超過予約しないことを実測する。※書き込みのため read-only ガードは付けない。
app.post("/reserve", async (c) => {
  const user = Number(c.req.query("user") ?? 1);
  const size = Number(c.req.query("size") ?? 30);
  const client = new pg.Client({ connectionString: c.env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    // used + size <= limit のときだけ used += size（0 行更新なら超過）。単一 UPDATE=原子的。
    const { rows, rowCount } = await client.query(
      `UPDATE poc_quota
         SET used_storage_bytes = used_storage_bytes + $2
       WHERE user_id = $1 AND used_storage_bytes + $2 <= storage_limit_bytes
       RETURNING used_storage_bytes`,
      [user, size]
    );
    return c.json({ reserved: rowCount === 1, used: rows[0]?.used_storage_bytes ?? null });
  } finally {
    await client.end();
  }
});

// PoC #04: 放棄解放（推奨する追加パターン）。0 未満に落ちないよう GREATEST でクランプ。
app.post("/release", async (c) => {
  const user = Number(c.req.query("user") ?? 1);
  const size = Number(c.req.query("size") ?? 30);
  const client = new pg.Client({ connectionString: c.env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(
      `UPDATE poc_quota
         SET used_storage_bytes = GREATEST(0, used_storage_bytes - $2)
       WHERE user_id = $1
       RETURNING used_storage_bytes`,
      [user, size]
    );
    return c.json({ ok: true, used: rows[0]?.used_storage_bytes ?? null });
  } finally {
    await client.end();
  }
});

// 本番データ探索（read-only）: 実在の user_id / video_id・ベクトル次元・件数を取得。
app.get("/probe", async (c) => {
  const client = new pg.Client({ connectionString: c.env.HYPERDRIVE.connectionString });
  await client.connect();
  await client.query("SET default_transaction_read_only = on");
  try {
    const counts = await client.query(
      "SELECT count(*)::int AS rows, count(DISTINCT user_id)::int AS users, count(DISTINCT video_id)::int AS videos FROM public.videoq_scenes"
    );
    const dim = await client.query(
      "SELECT format_type(a.atttypid, a.atttypmod) AS t FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='videoq_scenes' AND a.attname='embedding'"
    );
    const sample = await client.query(
      "SELECT user_id, video_id, count(*)::int AS scenes FROM public.videoq_scenes GROUP BY user_id, video_id ORDER BY scenes DESC LIMIT 8"
    );
    const idx = await client.query(
      "SELECT indexname FROM pg_indexes WHERE tablename='videoq_scenes'"
    );
    return c.json({
      ok: true,
      counts: counts.rows[0],
      embedding_type: dim.rows[0]?.t,
      indexes: idx.rows.map((r: any) => r.indexname),
      sample: sample.rows,
    });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  } finally {
    await client.end();
  }
});

app.get("/health", (c) => c.json({ ok: true }));

export default app;
