import { eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { sqlNumberArray } from "../db/sql-array";
import { sceneEmbeddings } from "../db/schema";
import type { Bindings } from "../types/bindings";

const ALLOWED_TABLES = new Set(["scene_embeddings"]);

function resolveVectorTable(env: Bindings): string {
  const name = env.PGVECTOR_COLLECTION_NAME || "scene_embeddings";
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`vector table '${name}' is not in the allowed list`);
  }
  return name; // allowlist 済みなので式内展開は安全
}

export type SceneHit = {
  content: string;
  videoId: number;
  videoTitle: string;
  startTime: string;
  endTime: string;
};

export const RETRIEVER_K = 20;

export async function searchScenes(
  env: Bindings,
  params: {
    userId: string;
    videoIds: readonly number[];
    embedding: readonly number[];
    k?: number;
  },
): Promise<SceneHit[]> {
  const table = resolveVectorTable(env);
  const k = params.k ?? RETRIEVER_K;
  if (params.videoIds.length === 0) return [];

  const vectorLiteral = `[${params.embedding.join(",")}]`;
  return withDb(env, async (db) => {
    const result = await db.execute(sql`
      SELECT content, video_id, langchain_metadata
        FROM ${sql.raw(table)}
       WHERE user_id = ${params.userId}
         AND video_id = ANY(${sqlNumberArray(params.videoIds)})
       ORDER BY embedding <=> ${vectorLiteral}::vector
       LIMIT ${k}
    `);
    const rows = result.rows as Array<{
      content: string;
      video_id: number;
      langchain_metadata: unknown;
    }>;
    return rows.map((row) => {
      const raw = row.langchain_metadata;
      const meta: Record<string, unknown> =
        typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
      const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
      return {
        content: row.content ?? "",
        videoId: Number(row.video_id),
        videoTitle: text(meta.video_title),
        startTime: text(meta.start_time),
        endTime: text(meta.end_time),
      };
    });
  });
}

export async function deleteVideoVectors(
  env: Bindings,
  videoId: number,
): Promise<number> {
  resolveVectorTable(env);
  return withDb(env, async (db) => {
    const deleted = await db
      .delete(sceneEmbeddings)
      .where(eq(sceneEmbeddings.videoId, videoId))
      .returning({ id: sceneEmbeddings.langchainId });
    return deleted.length;
  });
}

export async function syncVectorTitle(
  env: Bindings,
  videoId: number,
  newTitle: string,
): Promise<number> {
  resolveVectorTable(env);
  return withDb(env, async (db) => {
    const updated = await db
      .update(sceneEmbeddings)
      .set({
        langchainMetadata: sql`jsonb_set(
          COALESCE(${sceneEmbeddings.langchainMetadata}::jsonb, '{}'::jsonb),
          '{video_title}',
          to_jsonb(${newTitle}::text)
        )`,
      })
      .where(eq(sceneEmbeddings.videoId, videoId))
      .returning({ id: sceneEmbeddings.langchainId });
    return updated.length;
  });
}
