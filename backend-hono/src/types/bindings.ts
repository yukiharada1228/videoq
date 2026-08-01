/**
 * Worker のバインディングと Hono の Variables（リクエストスコープの値）。
 * バインディング型は一元管理する（要件 NFR-M1）。
 */
export type Bindings = {
  // Cloudflare リソース
  HYPERDRIVE: Hyperdrive;
  VIDEO_BUCKET: R2Bucket;

  // 環境変数
  ENVIRONMENT: "development" | "staging" | "production";
  LEGACY_API_ORIGIN: string;
  CORS_ALLOW_ORIGIN: string;

  // 機密（`wrangler secret` / `.dev.vars`）
  // SimpleJWT の署名鍵。現行 Django の SECRET_KEY と一致させる（HS256, PoC #03）。
  JWT_SECRET: string;

  // R2 の presigned GET URL 生成用（`file` フィールド）。django-storages と同じ S3 認証情報。
  // 本番のみ必須（アップロード動画がある場合）。region は "auto"、endpoint は R2 S3 API。
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_S3_ENDPOINT?: string; // https://<account>.r2.cloudflarestorage.com
  R2_BUCKET_NAME?: string;
  // OPENAI_API_KEY?: string;  // Phase 2 以降
};

// ミドルウェアが c.set/c.get で受け渡す値
export type Variables = {
  requestId: string;
  userId?: number; // 認証ミドルウェアが設定（SimpleJWT の user_id クレーム）
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
