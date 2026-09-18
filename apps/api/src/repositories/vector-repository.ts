import { PGEngine, PGVectorStore } from "@yukiharada1228/langchain-postgres";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import pg from "pg";
import { embedQuery } from "../lib/embeddings";
import { resolveEmbeddingConfig } from "../lib/embedding-contract";
import { assertEmbeddingSchema } from "../lib/embedding-schema";
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

/**
 * 検索クエリの埋め込みは EMBEDDING_PROVIDER（openai / ollama）の切り替えを持つ
 * lib/embeddings.ts に一本化する。インデックス作成は worker 側の責務なので、
 * embedDocuments は API からは呼ばれない。
 */
function sceneEmbeddings(env: Bindings): EmbeddingsInterface {
  return {
    embedQuery: (text: string) => embedQuery(env, text),
    embedDocuments: (texts: string[]) =>
      Promise.all(texts.map((text) => embedQuery(env, text))),
  };
}

function parseMetadataColumn(rows: Array<Record<string, unknown>>): void {
  for (const row of rows) {
    const raw = row.langchain_metadata;
    if (typeof raw === "string") {
      try {
        row.langchain_metadata = JSON.parse(raw);
      } catch {
        row.langchain_metadata = {};
      }
    }
  }
}

/**
 * pg は json 列を既定で自動パースするが、Hyperdrive 経由の Workers 環境では
 * 文字列のまま返ることがある（chat-repository.ts の mapCitations と同様の既知事象）。
 * ライブラリの rowToDocument は metadata オブジェクトへ直接プロパティ代入するため、
 * 文字列のままだと TypeError で落ちる。ここでクエリ結果を正規化してから渡す。
 */
function withMetadataParsing(pool: pg.Pool): pg.Pool {
  const rawQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<pg.QueryResult> | void;
  const rawConnect = pool.connect.bind(pool) as (...args: unknown[]) => Promise<pg.PoolClient> | void;
  const wrappedClients = new WeakSet<pg.PoolClient>();

  (pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
    // pg 内部は callback 形式も使う。戻り値が Promise の呼び出しだけを加工する。
    return rawQuery(...args)?.then((result) => {
      parseMetadataColumn(result.rows);
      return result;
    });
  };

  (pool as unknown as { connect: unknown }).connect = (...args: unknown[]) => {
    return rawConnect(...args)?.then((client) => {
      if (!wrappedClients.has(client)) {
        wrappedClients.add(client);
        const rawClientQuery = client.query.bind(client) as (...args: unknown[]) => Promise<pg.QueryResult> | void;
        (client as unknown as { query: unknown }).query = (...queryArgs: unknown[]) => {
          return rawClientQuery(...queryArgs)?.then((result) => {
            parseMetadataColumn(result.rows);
            return result;
          });
        };
      }
      return client;
    });
  };

  return pool;
}

const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/**
 * リクエストスコープのシーン検索ハンドル。
 * ReAct は 1 リクエスト内で複数回検索するため、engine / store は開きっぱなしにして
 * 使い回し、呼び出し側が finally で close する。
 */
export type SceneSearch = {
  /** open 時のスコープ内に限り、動画をさらに絞り込める。 */
  search(query: string, k?: number, videoIds?: readonly number[]): Promise<SceneHit[]>;
  close(): Promise<void>;
};

export async function openSceneSearch(
  env: Bindings,
  params: { userId: string; videoIds: readonly number[] },
): Promise<SceneSearch> {
  const table = resolveVectorTable(env);
  const config = resolveEmbeddingConfig(env);
  const allowedVideoIds = new Set(params.videoIds);

  // Pool はリクエストごとに生成し、
  // リクエストをまたいで使い回さない（max: 1 で実質 pg.Client 相当）。
  const pool = withMetadataParsing(
    new pg.Pool({
      connectionString: env.HYPERDRIVE.connectionString,
      max: 1,
    }),
  );
  const engine = PGEngine.fromPool(pool);
  let store: PGVectorStore;
  try {
    await assertEmbeddingSchema(pool, config);
    store = await PGVectorStore.initialize(engine, sceneEmbeddings(env), table, {
      metadataColumns: ["user_id", "video_id"],
    });
  } catch (error) {
    await engine.close();
    throw error;
  }

  return {
    async search(query: string, k = RETRIEVER_K, videoIds?: readonly number[]): Promise<SceneHit[]> {
      if (videoIds !== undefined && (
        videoIds.length === 0 || videoIds.some((id) => !allowedVideoIds.has(id))
      )) {
        throw new Error("Video selection must be a non-empty subset of the current course.");
      }
      const selected = videoIds === undefined ? [...allowedVideoIds] : [...new Set(videoIds)];
      if (selected.length === 0) return [];
      const filter = {
        user_id: params.userId,
        video_id: { $in: selected },
      };
      const hits = await store.similaritySearchWithScore(query, k, filter);
      return hits.map(([doc]) => ({
        content: doc.pageContent ?? "",
        videoId: Number(doc.metadata?.video_id),
        videoTitle: text(doc.metadata?.video_title),
        startTime: text(doc.metadata?.start_time),
        endTime: text(doc.metadata?.end_time),
      }));
    },
    close: () => engine.close(),
  };
}
