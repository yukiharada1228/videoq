import type { Context } from "hono";
import { z } from "@hono/zod-openapi";
import type { AppEnv } from "../types/bindings";

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const listMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export function createListResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: listMetaSchema,
  });
}

export type ListMeta = z.infer<typeof listMetaSchema>;

export function parseLimitOffset(
  c: Context<AppEnv>,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): { limit: number; offset: number } {
  const defaultLimit = opts.defaultLimit ?? 20;
  const maxLimit = opts.maxLimit ?? 100;

  let limit = defaultLimit;
  const limitRaw = c.req.query("limit");
  if (limitRaw !== undefined) {
    const n = Number(limitRaw);
    if (Number.isInteger(n) && n > 0) limit = Math.min(n, maxLimit);
  }

  let offset = 0;
  const offsetRaw = c.req.query("offset");
  if (offsetRaw !== undefined) {
    const n = Number(offsetRaw);
    if (Number.isInteger(n) && n >= 0) offset = n;
  }

  return { limit, offset };
}

export function listResponse<T>(data: T[], meta: ListMeta) {
  return { data, meta };
}

export function singleResponse<T>(data: T) {
  return { data };
}

export const singleResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({ data: itemSchema });
