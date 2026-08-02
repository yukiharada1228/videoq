import { withDb } from "../db/pool";
import type { Bindings } from "../types/bindings";

/**
 * PGVector（langchain）メタデータの同期。VideoQ は user_id/video_id を独立列に持つ
 * （metadata_columns=["user_id","video_id"]）ため、video_id 列で直接 SQL 操作する。
 * テーブル名は SQL インジェクション防止のため allowlist 照合（Django と同じ方針）。
 */
const ALLOWED_TABLES = new Set(["videoq_scenes"]);

function resolveVectorTable(env: Bindings): string {
  const name = env.PGVECTOR_COLLECTION_NAME || "videoq_scenes";
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`vector table '${name}' is not in the allowed list`);
  }
  return name; // allowlist 済みなので式内展開は安全
}

/** 検索ヒット 1 件（langchain Document 相当）。 */
export type SceneHit = {
  content: string;
  videoId: number;
  videoTitle: string;
  startTime: string;
  endTime: string;
};

/** Django `as_retriever(search_kwargs={"k": 20, ...})` の既定 k。 */
export const RETRIEVER_K = 20;

/**
 * シーンのベクトル検索（PoC #01 で確定した「直接 SQL 本線」）。
 * 標準 LangChain.js の PGVector メタデータフィルタは `langchain_metadata->>'user_id'` を
 * 見るため VideoQ では 0 件になる（PoC #01 §6.5-D）。user_id/video_id は独立列で絞る。
 *
 * cosine 距離 `<=>` の昇順・上位 k 件。認可は user_id 一致 + 許可 video_id のみ。
 */
export async function searchScenes(
  env: Bindings,
  params: {
    userId: number;
    videoIds: readonly number[];
    vectorLiteral: string;
    k?: number;
  },
): Promise<SceneHit[]> {
  const table = resolveVectorTable(env);
  const k = params.k ?? RETRIEVER_K;
  if (params.videoIds.length === 0) return [];

  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT content, video_id, langchain_metadata
         FROM ${table}
        WHERE user_id = $2
          AND video_id = ANY($3::int[])
        ORDER BY embedding <=> $1::vector
        LIMIT $4`,
      [params.vectorLiteral, params.userId, [...params.videoIds], k],
    );
    return rows.map((r) => {
      // langchain_metadata は json 列（pg が object にパース）。文字列で返る実装にも備える。
      const raw = r.langchain_metadata;
      const meta: Record<string, unknown> =
        typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
      const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
      return {
        content: r.content ?? "",
        videoId: Number(r.video_id),
        videoTitle: text(meta.video_title),
        startTime: text(meta.start_time),
        endTime: text(meta.end_time),
      };
    });
  });
}

/** 動画に紐づくベクトルを削除（delete_video_vectors 相当）。best-effort で使う。 */
export async function deleteVideoVectors(
  env: Bindings,
  videoId: number,
): Promise<number> {
  const table = resolveVectorTable(env);
  return withDb(env, async (db, client) => {
    const r = await client.query(`DELETE FROM ${table} WHERE video_id = $1`, [videoId]);
    return r.rowCount ?? 0;
  });
}

/**
 * タイトル変更に伴う langchain_metadata.video_title の更新（update_video_title_in_vectors 相当）。
 * 更新件数を返す。呼び出し側は best-effort（失敗を握りつぶす）で使う。
 */
export async function syncVectorTitle(
  env: Bindings,
  videoId: number,
  newTitle: string,
): Promise<number> {
  const table = resolveVectorTable(env);
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `UPDATE ${table}
          SET langchain_metadata = jsonb_set(
            COALESCE(langchain_metadata::jsonb, '{}'::jsonb),
            '{video_title}',
            to_jsonb($1::text)
          )
        WHERE video_id = $2`,
      [newTitle, videoId],
    );
    return r.rowCount ?? 0;
  });
}
