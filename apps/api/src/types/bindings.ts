import type { RateLimiter } from "../durable-objects/rate-limiter";

/**
 * Worker のバインディングと Hono の Variables（リクエストスコープの値）。
 * バインディング型は一元管理する（要件 NFR-M1）。
 */
export type Bindings = {
  // Cloudflare リソース
  HYPERDRIVE: Hyperdrive;
  VIDEO_BUCKET: R2Bucket;
  /**
   * API レート制限用のスライディング・ウィンドウ・カウンタ。
   * 未バインド時は fail closed。
   */
  RATE_LIMITER?: DurableObjectNamespace<RateLimiter>;
  /**
   * Study モードの一時的な学習者状態を保持する KV。
   * TTL 12h。未バインド時は study が設定エラーになる。
   */
  STUDY_SESSION?: KVNamespace;

  // 環境変数
  ENVIRONMENT: "development" | "staging" | "production";
  CORS_ALLOW_ORIGIN: string;
  /**
   * `"true"` のとき S3 API の署名 URL を使う。
   * それ以外はローカル VIDEO_BUCKET + `/api/media/` + multipart。
   */
  USE_S3_STORAGE?: string;
  // PGVector コレクション=テーブル名。既定 "scene_embeddings"（allowlist 照合）。
  PGVECTOR_COLLECTION_NAME?: string;
  // 新規ユーザーの既定アップロード上限 MB（既定 1024 = 1GB）。
  MAX_VIDEO_UPLOAD_SIZE_MB?: string;
  /**
   * 新規サインアップ時の無料枠。未設定時は 10GB / 60分 / 100回。
   * `"null"` または `"unlimited"` で無制限。`"0"` はゼロ枠。
   */
  DEFAULT_STORAGE_LIMIT_GB?: string;
  DEFAULT_PROCESSING_LIMIT_MINUTES?: string;
  DEFAULT_AI_ANSWERS_LIMIT?: string;
  // 認証系メール（検証 / 再設定 / アドレス変更）のリンク先。
  FRONTEND_URL?: string;
  /** Public OAuth issuer; defaults to the request origin. */
  OAUTH_ISSUER_URL?: string;
  /** Enables OpenID Connect discovery, JWKS, and UserInfo. */
  OIDC_ENABLED?: string;
  OIDC_LOGOUT_ENABLED?: string;
  OIDC_LOGOUT_ALWAYS_PROMPT?: string;
  OIDC_LOGOUT_ACCEPT_EXPIRED_TOKENS?: string;
  OIDC_LOGOUT_DELETE_TOKENS?: string;
  // 送信元アドレス（既定 noreply@videoq.local）。
  DEFAULT_FROM_EMAIL?: string;
  // Cloudflare Email Sending バインディング（send_email）。ドメイン onboarding が実配信の前提。
  EMAIL?: EmailSendBinding;

  // RAG チャットのモデル設定。
  /** `"openai"`（既定）または `"ollama"`。ローカル DB が Ollama 埋め込みなら ollama。 */
  EMBEDDING_PROVIDER?: string;
  EMBEDDING_MODEL?: string; // 既定 text-embedding-3-small
  /** OpenAI の dimensions 指定（任意）。未設定ならモデル既定次元。 */
  EMBEDDING_VECTOR_SIZE?: string;
  /** Ollama base URL（既定 http://127.0.0.1:11434）。 */
  OLLAMA_BASE_URL?: string;
  LLM_MODEL?: string; // 既定 gpt-4o-mini
  OPENAI_BASE_URL?: string; // 既定 https://api.openai.com/v1（テスト・互換エンドポイント用）

  // 機密（`wrangler secret` / `.dev.vars`）
  /** Application access-token signing secret. Configure with `wrangler secret`. */
  AUTH_JWT_SECRET: string;
  /** Stable issuer embedded in application access tokens. */
  AUTH_ISSUER?: string;
  /** Base64url-encoded 32-byte AES-GCM key for encrypted user secrets. */
  USER_SECRET_ENCRYPTION_KEY: string;
  /** PEM key for RS256 ID tokens and JWKS. */
  OIDC_RSA_PRIVATE_KEY?: string;

  // S3 互換（本番 R2 / ローカル MinIO）の認証情報。USE_S3_STORAGE=true のとき必須。
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_S3_ENDPOINT?: string; // 公開 URL（presign）。MinIO: http://127.0.0.1:9000
  /** Head/Delete 用。未設定時は R2_S3_ENDPOINT。compose 内 API は http://minio:9000 */
  R2_S3_INTERNAL_ENDPOINT?: string;
  R2_BUCKET_NAME?: string;
  /** SigV4 region。R2 は "auto"（既定）。MinIO / AWS は "us-east-1" など。 */
  R2_S3_REGION?: string;

  // 非同期ジョブ投入（Worker → SQS、PoC #02 方式 B）。IAM は sqs:SendMessage のみ（JR-5）。
  SQS_QUEUE_URL?: string;
  AWS_REGION?: string; // 既定 ap-northeast-1
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string; // 一時資格情報のときのみ

  // RAG チャットの埋め込み / 生成に使うサーバー側キー。
  // ユーザー個別キーとは別に管理する。
  OPENAI_API_KEY?: string;

  // Optional Mailgun fallback when Cloudflare Email Sending is not onboarded.
  MAILGUN_API_KEY?: string;
  MAILGUN_SENDER_DOMAIN?: string;
};

// ミドルウェアが c.set/c.get で受け渡す値
export type Variables = {
  requestId: string;
  userId?: number;
  // 認証経路。share = 共有スラッグ経由の匿名アクセス。
  authVia?: "apikey" | "bearer" | "share" | "oauth";
  // API キー認証時の access_level（"all" | "read_only"）。scope 判定に使う。
  apiKeyAccessLevel?: string;
  // Share 認証時の share_slug（feedback 等の共有アクセス）。
  shareSlug?: string;
  // ProtectedMedia の share 認証時に解決した group_id。
  shareGroupId?: number;
};

// Cloudflare Email Sending バインディングの最小形（env.EMAIL.send(...)）。
export interface EmailSendBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
  }): Promise<unknown>;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
