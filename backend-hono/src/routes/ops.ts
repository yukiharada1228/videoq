import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { requireAuth, jwtMethod, apiKeyMethod } from "../middleware/auth";
import { csrfProtect } from "../middleware/csrf";
import { enqueueReindexAllEmbeddings } from "../lib/jobs";
import {
  getOpsUser,
  isSuperuser,
  listOpsUsers,
  patchOpsUserQuota,
  patchOpsUserUsage,
  type QuotaPatch,
  type UsagePatch,
} from "../repositories/ops-repository";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import { apiError } from "../utils/responses";
import type { AppEnv } from "../types/bindings";

/**
 * Django Admin 代替の運用 API（superuser のみ）。
 * quota 設定・使用量修正・全件 embedding reindex。
 */
export const opsRoutes = new Hono<AppEnv>();

const requireSuperuser = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  if (userId == null) {
    return c.json({ detail: "Authentication credentials were not provided." }, 401);
  }
  if (!(await isSuperuser(c.env, userId))) {
    return c.json(
      { detail: "You do not have permission to perform this action." },
      403,
    );
  }
  await next();
});

const opsGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  csrfProtect,
  requireSuperuser,
] as const;

const listUsers = async (c: Context<AppEnv>) => {
  const { limit, offset } = parseLimitOffset(c);
  const q = c.req.query("q")?.trim() ?? "";
  const { count, results } = await listOpsUsers(c.env, q, limit, offset);
  return c.json(limitOffsetPage(c, count, limit, offset, results));
};

const getUser = async (c: Context<AppEnv>) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return apiError(c, 404, "User not found");
  const user = await getOpsUser(c.env, id);
  if (!user) return apiError(c, 404, "User not found");
  return c.json(user);
};

function readOptionalNumber(
  body: Record<string, unknown>,
  key: string,
  allowNull: boolean,
): { ok: true; value?: number | null } | { ok: false; message: string } {
  if (!(key in body)) return { ok: true };
  const v = body[key];
  if (v === null) {
    if (!allowNull) return { ok: false, message: `${key} may not be null.` };
    return { ok: true, value: null };
  }
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return { ok: false, message: `${key} must be a number.` };
  }
  return { ok: true, value: v };
}

const patchQuota = async (c: Context<AppEnv>) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return apiError(c, 404, "User not found");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: QuotaPatch = {};

  const maxMb = readOptionalNumber(body, "max_video_upload_size_mb", false);
  if (!maxMb.ok) return apiError(c, 400, maxMb.message);
  if (maxMb.value !== undefined && maxMb.value !== null) {
    if (!Number.isInteger(maxMb.value) || maxMb.value < 1) {
      return apiError(c, 400, "max_video_upload_size_mb must be a positive integer.");
    }
    patch.max_video_upload_size_mb = maxMb.value;
  }

  for (const key of [
    "storage_limit_gb",
    "processing_limit_minutes",
    "ai_answers_limit",
  ] as const) {
    const r = readOptionalNumber(body, key, true);
    if (!r.ok) return apiError(c, 400, r.message);
    if (r.value !== undefined) {
      (patch as Record<string, number | null | undefined>)[key] = r.value;
    }
  }

  const user = await patchOpsUserQuota(c.env, id, patch);
  if (!user) return apiError(c, 404, "User not found");
  return c.json(user);
};

const patchUsage = async (c: Context<AppEnv>) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return apiError(c, 404, "User not found");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: UsagePatch = {};

  for (const key of [
    "used_storage_bytes",
    "used_processing_seconds",
    "used_ai_answers",
  ] as const) {
    const r = readOptionalNumber(body, key, false);
    if (!r.ok) return apiError(c, 400, r.message);
    if (r.value !== undefined && r.value !== null) {
      if (!Number.isInteger(r.value) || r.value < 0) {
        return apiError(c, 400, `${key} must be a non-negative integer.`);
      }
      patch[key] = r.value;
    }
  }

  if ("usage_period_start" in body) {
    const v = body.usage_period_start;
    if (v !== null && typeof v !== "string") {
      return apiError(c, 400, "usage_period_start must be a string or null.");
    }
    patch.usage_period_start = v as string | null;
  }
  if ("is_over_quota" in body) {
    if (typeof body.is_over_quota !== "boolean") {
      return apiError(c, 400, "is_over_quota must be a boolean.");
    }
    patch.is_over_quota = body.is_over_quota;
  }

  const user = await patchOpsUserUsage(c.env, id, patch);
  if (!user) return apiError(c, 404, "User not found");
  return c.json(user);
};

const reindexAll = async (c: Context<AppEnv>) => {
  const jobId = await enqueueReindexAllEmbeddings(c.env);
  if (!jobId) {
    return apiError(c, 503, "Failed to enqueue reindex job (SQS not configured).");
  }
  return c.json({ job_id: jobId }, 202);
};

opsRoutes.get("/api/ops/users", ...opsGuards, listUsers);
opsRoutes.get("/api/ops/users/", ...opsGuards, listUsers);
opsRoutes.get("/api/ops/users/:id{[0-9]+}", ...opsGuards, getUser);
opsRoutes.get("/api/ops/users/:id{[0-9]+}/", ...opsGuards, getUser);
opsRoutes.patch("/api/ops/users/:id{[0-9]+}/quota", ...opsGuards, patchQuota);
opsRoutes.patch("/api/ops/users/:id{[0-9]+}/quota/", ...opsGuards, patchQuota);
opsRoutes.patch("/api/ops/users/:id{[0-9]+}/usage", ...opsGuards, patchUsage);
opsRoutes.patch("/api/ops/users/:id{[0-9]+}/usage/", ...opsGuards, patchUsage);
opsRoutes.post("/api/ops/embeddings/reindex-all", ...opsGuards, reindexAll);
opsRoutes.post("/api/ops/embeddings/reindex-all/", ...opsGuards, reindexAll);
