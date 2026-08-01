import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth, apiKeyMethod, jwtMethod } from "../middleware/auth";
import { getCurrentUser } from "../repositories/user-repository";
import type { AppEnv } from "../types/bindings";

/**
 * 認証・アカウント系のうち **Worker へ移行済み**のルートのみを定義する。
 * ここに無い /api/auth/* （login, signup, refresh, ...）は app.ts のプロキシで
 * 既存 Django に流れる（ストラングラーフィグ）。
 *
 * 移行済み:
 *   GET /api/auth/me  ── 現在のユーザー情報（Django UserSerializer と契約互換の生 JSON）
 */
export const authRoutes = new Hono<AppEnv>();

// MeView.authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication] と同順。
const meAuth = requireAuth(apiKeyMethod, jwtMethod);

const me = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!; // 認証通過後は必ず存在
  const user = await getCurrentUser(c.env, userId);
  if (!user) return c.json({ detail: "Not found." }, 404);
  return c.json(user); // 統一封筒を使わず Django の生レスポンス形を返す
};

// Django は末尾スラッシュ（APPEND_SLASH）。両方受ける。
authRoutes.get("/me", meAuth, me);
authRoutes.get("/me/", meAuth, me);
