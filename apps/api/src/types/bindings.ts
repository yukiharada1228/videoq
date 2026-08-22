/**
 * Worker のバインディングと Hono の Variables（リクエストスコープの値）。
 * Cloudflare リソースと wrangler vars は `npm run cf-typegen` の生成型を使う。
 * ここには wrangler 設定から生成できない任意 secret だけを追加する。
 */
type SecretBindings = {
  BETTER_AUTH_SECRET?: string;
  AUTH_JWT_SECRET?: string;
  USER_SECRET_ENCRYPTION_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OIDC_RSA_PRIVATE_KEY?: string;
  OPENAI_API_KEY?: string;
  MAILGUN_API_KEY?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export type Bindings = Omit<CloudflareBindings, keyof SecretBindings> &
  SecretBindings & {
    // 互換用の任意設定。
    OPENAI_BASE_URL?: string;
    AWS_SESSION_TOKEN?: string;
    R2_S3_INTERNAL_ENDPOINT?: string;

    /** @deprecated Unused after Better Auth migration. */
    AUTH_ISSUER?: string;
    OIDC_LOGOUT_ENABLED?: string;
    OIDC_LOGOUT_ALWAYS_PROMPT?: string;
    OIDC_LOGOUT_ACCEPT_EXPIRED_TOKENS?: string;
    OIDC_LOGOUT_DELETE_TOKENS?: string;
    STRIPE_AUTOMATIC_TAX?: string;
  };

// ミドルウェアが c.set/c.get で受け渡す値
export type Variables = {
  requestId: string;
  userId?: string;
  // 認証経路。share = 共有スラッグ経由の匿名アクセス。
  authVia?: "apikey" | "bearer" | "share" | "oauth";
  // API キー認証時の access_level（"all" | "read_only"）。scope 判定に使う。
  apiKeyAccessLevel?: string;
  // Share 認証時の share_slug（feedback 等の共有アクセス）。
  shareSlug?: string;
  // ProtectedMedia の share 認証時に解決した group_id。
  shareGroupId?: number;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
