import type { Context } from "hono";
import type { AppEnv } from "../types/bindings";

/** Validate state-changing cookie requests against configured browser origins. */
export function hasTrustedOrigin(c: Context<AppEnv>): boolean {
  let origin = c.req.header("Origin")?.trim();
  if (!origin) {
    const referer = c.req.header("Referer");
    if (referer) {
      try {
        origin = new URL(referer).origin;
      } catch {
        return false;
      }
    }
  }
  if (!origin) return false;
  const allowed = new Set(
    c.env.CORS_ALLOW_ORIGIN.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  allowed.add(new URL(c.req.url).origin);
  return allowed.has(origin);
}
