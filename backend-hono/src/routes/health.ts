import { Hono } from "hono";
import { pingDb } from "../db/pool";
import { ok, err } from "../utils/responses";
import type { AppEnv } from "../types/bindings";

/**
 * /health : liveness（依存に触れない。Worker が生きているか）
 * /ready  : readiness（Hyperdrive 経由で DB に疎通できるか）
 */
export const health = new Hono<AppEnv>();

health.get("/health", (c) => ok(c, { status: "ok", env: c.env.ENVIRONMENT }));

health.get("/ready", async (c) => {
  try {
    const dbOk = await pingDb(c.env);
    if (!dbOk) return err(c, 503, "db_unready", "database check failed");
    return ok(c, { status: "ready", db: "ok" });
  } catch (e) {
    return err(c, 503, "db_unready", "database unreachable");
  }
});
