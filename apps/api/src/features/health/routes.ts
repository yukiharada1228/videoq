import { pingDb } from "../../db/pool";
import { toErrorBody } from "../../shared/errors";
import {
  createFeatureRouter,
  createRoute,
  jsonResponse,
  errorResponse,
  z,
} from "../../shared/openapi";
import { singleResponseSchema } from "../../shared/pagination";

const healthDataSchema = z.object({
  status: z.literal("ok"),
  env: z.string(),
});

const readyDataSchema = z.object({
  status: z.literal("ready"),
  db: z.literal("ok"),
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Liveness probe",
  responses: {
    200: jsonResponse(singleResponseSchema(healthDataSchema), "Worker is alive"),
  },
});

const readyRoute = createRoute({
  method: "get",
  path: "/ready",
  tags: ["Health"],
  summary: "Readiness probe (DB connectivity)",
  responses: {
    200: jsonResponse(singleResponseSchema(readyDataSchema), "Ready to serve traffic"),
    503: errorResponse("Dependency unavailable"),
  },
});

export const healthRoutes = createFeatureRouter();

healthRoutes.openapi(healthRoute, (c) =>
  c.json({ data: { status: "ok", env: c.env.ENVIRONMENT } }, 200),
);

healthRoutes.openapi(readyRoute, async (c) => {
  try {
    const dbOk = await pingDb(c.env);
    if (!dbOk) {
      return c.json(toErrorBody("DB_UNREADY", "Database check failed"), 503);
    }
    return c.json({ data: { status: "ready", db: "ok" } }, 200);
  } catch {
    return c.json(toErrorBody("DB_UNREADY", "Database unreachable"), 503);
  }
});
