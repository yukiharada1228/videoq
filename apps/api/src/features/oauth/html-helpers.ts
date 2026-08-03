import type { Context } from "hono";
import {
  consumeActionToken,
  createActionToken,
  resolveAuthSession,
} from "../../repositories/auth-repository";
import { refreshTokenFromCookie } from "../../lib/refresh-cookie";
import { hasTrustedOrigin } from "../../shared/origin";
import type { AppEnv } from "../../types/bindings";

export async function cookieUserId(c: Context<AppEnv>): Promise<number | null> {
  const session = await resolveAuthSession(c.env, refreshTokenFromCookie(c));
  return session?.userId ?? null;
}

export function loginRedirect(c: Context<AppEnv>): Response {
  const next = encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search);
  const front = (c.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  return c.redirect(`${front}/login?next=${next}`, 302);
}

export async function issueFormActionToken(
  c: Context<AppEnv>,
  userId: number,
): Promise<string> {
  return createActionToken(c.env, userId, "oauth_form", {}, 10 * 60);
}

export async function consumeFormActionToken(
  c: Context<AppEnv>,
  userId: number,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  if (!hasTrustedOrigin(c)) return false;
  const action = await consumeActionToken(c.env, token, "oauth_form");
  return action?.userId === userId;
}
