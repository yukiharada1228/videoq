import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../types/bindings";

/** Opaque refresh session cookie. Production uses `__Host-` (Secure, Path=/, no Domain). */
export const REFRESH_COOKIE_TTL_SECONDS = 14 * 24 * 60 * 60;

export function refreshCookieName(c: Context<AppEnv>): string {
  return c.env.ENVIRONMENT === "production" ? "__Host-vq_refresh" : "vq_refresh";
}

export function refreshTokenFromCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, refreshCookieName(c));
}

export function setRefreshCookie(c: Context<AppEnv>, refresh: string): void {
  const secure = c.env.ENVIRONMENT === "production";
  // Same-origin SPA (`/api` on videoq.jp): Lax is correct. SameSite=None is for
  // cross-site cookies and is stricter on mobile Safari / ITP.
  setCookie(c, refreshCookieName(c), refresh, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    maxAge: REFRESH_COOKIE_TTL_SECONDS,
    path: "/",
  });
}

export function clearRefreshCookie(c: Context<AppEnv>): void {
  const secure = c.env.ENVIRONMENT === "production";
  deleteCookie(c, refreshCookieName(c), {
    path: "/",
    sameSite: "Lax",
    secure,
  });
}
