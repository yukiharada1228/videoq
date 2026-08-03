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
   * Django SimpleRateThrottle 相当のスライディング・ウィンドウ・カウンタ。
   * 未バインド時はプロセス内メモリ実装へフォールバック（unit test / 暫定）。
   */
  RATE_LIMITER?: DurableObjectNamespace<RateLimiter>;
  /**
   * Study モードのエフェメラル学習者状態 H（Django cache `plog:study:ephemeral:` 相当）。
   * TTL 12h。未バインド時は study が設定エラーになる。
   */
  STUDY_SESSION?: KVNamespace;

  // 環境変数
  ENVIRONMENT: "development" | "staging" | "production";
  /** @deprecated Django プロキシ廃止済み。互換のため残置可。 */
  LEGACY_API_ORIGIN?: string;
  CORS_ALLOW_ORIGIN: string;
  /**
   * Django `USE_S3_STORAGE` 相当。
   * `"true"` のとき R2 署名 URL。それ以外はローカル VIDEO_BUCKET + `/api/media/` + multipart。
   */
  USE_S3_STORAGE?: string;
  // PGVector（langchain）コレクション=テーブル名。既定 "videoq_scenes"（allowlist 照合）。
  PGVECTOR_COLLECTION_NAME?: string;
  // 新規ユーザーの既定アップロード上限 MB（Django MAX_VIDEO_UPLOAD_SIZE_MB, 既定 500）。
  MAX_VIDEO_UPLOAD_SIZE_MB?: string;
  // 認証系メール（検証 / 再設定 / アドレス変更）のリンク先（Django FRONTEND_URL, 既定 http://localhost:3000）。
  FRONTEND_URL?: string;
  /**
   * OAuth 発行者 / 公開 API オリジン（Django `OAUTH2_PROVIDER_ISSUER_URL`）。
   * MCP の 401 `WWW-Authenticate: resource_metadata` に使う。
   * 未設定時はリクエストの origin（Workers 公開 URL）を使う。
   */
  OAUTH2_PROVIDER_ISSUER_URL?: string;
  /**
   * Django `OAUTH2_PROVIDER.OIDC_ENABLED`。`"true"` のとき
   * openid-configuration / jwks / userinfo（+ 任意で RP logout）を有効化。
   * 未設定・false は DOT 既定どおり 404。
   */
  OIDC_ENABLED?: string;
  /** Django `OIDC_RP_INITIATED_LOGOUT_ENABLED`。OIDC_ENABLED も必要。 */
  OIDC_RP_INITIATED_LOGOUT_ENABLED?: string;
  /** Django `OIDC_RP_INITIATED_LOGOUT_ALWAYS_PROMPT`（既定 true）。 */
  OIDC_RP_INITIATED_LOGOUT_ALWAYS_PROMPT?: string;
  /** Django `OIDC_RP_INITIATED_LOGOUT_ACCEPT_EXPIRED_TOKENS`（既定 true）。 */
  OIDC_RP_INITIATED_LOGOUT_ACCEPT_EXPIRED_TOKENS?: string;
  /** Django `OIDC_RP_INITIATED_LOGOUT_DELETE_TOKENS`（既定 true）。 */
  OIDC_RP_INITIATED_LOGOUT_DELETE_TOKENS?: string;
  // 送信元アドレス（Django DEFAULT_FROM_EMAIL, 既定 noreply@videoq.local）。
  DEFAULT_FROM_EMAIL?: string;
  // Cloudflare Email Sending バインディング（send_email）。ドメイン onboarding が実配信の前提。
  EMAIL?: EmailSendBinding;

  // RAG チャット（Django EMBEDDING_* / LLM_MODEL と同じ既定値）。
  /** `"openai"`（既定）または `"ollama"`。ローカル DB が Ollama 埋め込みなら ollama。 */
  EMBEDDING_PROVIDER?: string;
  EMBEDDING_MODEL?: string; // 既定 text-embedding-3-small
  /** OpenAI の dimensions 指定（任意）。未設定ならモデル既定次元。 */
  EMBEDDING_VECTOR_SIZE?: string;
  /** Ollama base URL（既定 http://127.0.0.1:11434）。 */
  OLLAMA_BASE_URL?: string;
  LLM_MODEL?: string; // 既定 gpt-4o-mini
  OPENAI_BASE_URL?: string; // 既定 https://api.openai.com/v1（テスト・互換 API 用）

  // 機密（`wrangler secret` / `.dev.vars`）
  // Django SECRET_KEY と一致させる（HS256 の SimpleJWT・uid/token リンク・Fernet 鍵導出で共用）。
  JWT_SECRET: string;
  /**
   * Django `OAUTH2_PROVIDER.OIDC_RSA_PRIVATE_KEY`（PEM）。
   * RS256 id_token / JWKS 用。改行は実改行または `\\n`。
   */
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

  // RAG チャットの埋め込み / 生成に使うサーバー側キー（Django settings.OPENAI_API_KEY と同一）。
  // ユーザー個別キーではない（Django も api_key=None 固定で呼ぶ）。
  OPENAI_API_KEY?: string;
};

// ミドルウェアが c.set/c.get で受け渡す値
export type Variables = {
  requestId: string;
  userId?: number; // 認証ミドルウェアが設定（SimpleJWT の user_id クレーム）
  // 認証経路（scope/CSRF の適用判定に使う）。share = 共有スラッグ経由の匿名アクセス。
  authVia?: "apikey" | "bearer" | "cookie" | "share" | "oauth";
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
