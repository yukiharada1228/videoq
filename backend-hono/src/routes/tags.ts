import { Hono } from "hono";
import type { Context } from "hono";
import {
  requireAuth,
  requireScope,
  apiKeyMethod,
  jwtMethod,
} from "../middleware/auth";
import { csrfProtect } from "../middleware/csrf";
import {
  createTag,
  deleteTag,
  updateTag,
  tagExists,
  listTagsPage,
  getTagDetail,
  normalizeTagName,
  isValidTagColor,
  INVALID_COLOR_MESSAGE,
  EMPTY_NAME_MESSAGE,
} from "../repositories/tag-repository";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import { apiError, drfValidationError } from "../utils/responses";
import { charField } from "../utils/drf-fields";
import type { AppEnv } from "../types/bindings";

/**
 * 移行済みのタグ系ルート（TagListView / TagDetailView と契約互換）。
 *   GET    /api/videos/tags/       ── タグ一覧（limit/offset, name 昇順）
 *   POST   /api/videos/tags/       ── タグ作成（201 TagListSerializer）
 *   GET    /api/videos/tags/:pk/   ── タグ詳細（200 TagDetailSerializer, ネスト videos）
 *   PATCH  /api/videos/tags/:pk/   ── タグ部分更新（200 詳細）
 *   PUT    /api/videos/tags/:pk/   ── タグ全更新（name/color 必須, 200 詳細）
 *   DELETE /api/videos/tags/:pk/   ── タグ削除（204）
 *
 * 認証は AuthenticatedViewMixin と同じ [APIKey, CookieJWT]。書き込みは
 * CSRF（cookie 認証時）と scope=write（apikey read_only 拒否）を適用。
 */
export const tagRoutes = new Hono<AppEnv>();

const tagAuth = requireAuth(apiKeyMethod, jwtMethod);

const tagWriteGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  csrfProtect,
  requireScope("write"),
] as const;

async function parseBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => ({}));
  return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
}

// TagCreateSerializer: name(max_length=50, trim_whitespace=False, required), color(CharField, required)
function validateTagCreate(
  body: Record<string, unknown>,
): { errors: Record<string, string[]> } | { name: string; color: string } {
  const errors: Record<string, string[]> = {};

  const nameRes = charField(body, "name", {
    required: true,
    maxLength: 50,
    trimWhitespace: false, // name は serializer 段階では trim しない
  });
  if (nameRes.kind === "error") errors.name = [nameRes.message];

  const colorRes = charField(body, "color", { required: true }); // color は trim（既定）
  if (colorRes.kind === "error") errors.color = [colorRes.message];

  if (Object.keys(errors).length) return { errors };
  return {
    name: (nameRes as { value: string }).value,
    color: (colorRes as { value: string }).value,
  };
}

// TagUpdate/FullUpdateSerializer: name(max50, trim なし), color。full=PUT は双方 required。
function validateTagUpdate(
  body: Record<string, unknown>,
  full: boolean,
): { errors: Record<string, string[]> } | { data: { name?: string; color?: string } } {
  const errors: Record<string, string[]> = {};

  const nameRes = charField(body, "name", {
    required: full,
    maxLength: 50,
    trimWhitespace: false,
  });
  if (nameRes.kind === "error") errors.name = [nameRes.message];

  const colorRes = charField(body, "color", { required: full });
  if (colorRes.kind === "error") errors.color = [colorRes.message];

  if (Object.keys(errors).length) return { errors };
  const data: { name?: string; color?: string } = {};
  if (nameRes.kind === "value") data.name = nameRes.value;
  if (colorRes.kind === "value") data.color = colorRes.value;
  return { data };
}

// GET /api/videos/tags/ ── タグ一覧
const listTagsHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await listTagsPage(c.env, userId, limit, offset);
  return c.json(limitOffsetPage(c, count, limit, offset, results));
};

tagRoutes.get("/api/videos/tags", tagAuth, listTagsHandler);
tagRoutes.get("/api/videos/tags/", tagAuth, listTagsHandler);

// GET /api/videos/tags/:pk/ ── タグ詳細
const tagDetailHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const tagId = Number(c.req.param("id"));
  const tag = await getTagDetail(c.env, tagId, userId);
  if (!tag) return apiError(c, 404, "Tag not found");
  return c.json(tag);
};

tagRoutes.get("/api/videos/tags/:id{[0-9]+}", tagAuth, tagDetailHandler);
tagRoutes.get("/api/videos/tags/:id{[0-9]+}/", tagAuth, tagDetailHandler);

// POST /api/videos/tags/ ── タグ作成
const createTagHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const body = await parseBody(c);

  const v = validateTagCreate(body);
  if ("errors" in v) return drfValidationError(c, v.errors);

  // ドメイン検証（InvalidTagInput → create_error_response, fields 無し）
  const name = normalizeTagName(v.name);
  if (name === null) return apiError(c, 400, EMPTY_NAME_MESSAGE);
  if (!isValidTagColor(v.color)) return apiError(c, 400, INVALID_COLOR_MESSAGE);

  const tag = await createTag(c.env, userId, name, v.color);
  return c.json(tag, 201);
};

tagRoutes.post("/api/videos/tags", ...tagWriteGuards, createTagHandler);
tagRoutes.post("/api/videos/tags/", ...tagWriteGuards, createTagHandler);

// PATCH/PUT /api/videos/tags/:pk/ ── タグ更新（full=PUT で name/color 必須）
// Django UseCase の順: serializer(400 fields) → 存在(404) → ドメイン(400 message) → 200 詳細
const updateTagHandler = (full: boolean) => async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const tagId = Number(c.req.param("id"));
  const body = await parseBody(c);

  const v = validateTagUpdate(body, full);
  if ("errors" in v) return drfValidationError(c, v.errors);

  // 404 はドメイン検証(400)より先（get_by_id → ResourceNotFound）
  if (!(await tagExists(c.env, tagId, userId)))
    return apiError(c, 404, "Tag not found");

  // ドメイン検証（normalize_optional_name → validate_optional_color の順）
  const fields: { name?: string; color?: string } = {};
  if (v.data.name !== undefined) {
    const n = normalizeTagName(v.data.name);
    if (n === null) return apiError(c, 400, EMPTY_NAME_MESSAGE);
    fields.name = n;
  }
  if (v.data.color !== undefined) {
    if (!isValidTagColor(v.data.color)) return apiError(c, 400, INVALID_COLOR_MESSAGE);
    fields.color = v.data.color;
  }

  await updateTag(c.env, tagId, userId, fields);
  const detail = await getTagDetail(c.env, tagId, userId);
  return c.json(detail);
};

tagRoutes.patch("/api/videos/tags/:id{[0-9]+}", ...tagWriteGuards, updateTagHandler(false));
tagRoutes.patch("/api/videos/tags/:id{[0-9]+}/", ...tagWriteGuards, updateTagHandler(false));
tagRoutes.put("/api/videos/tags/:id{[0-9]+}", ...tagWriteGuards, updateTagHandler(true));
tagRoutes.put("/api/videos/tags/:id{[0-9]+}/", ...tagWriteGuards, updateTagHandler(true));

// DELETE /api/videos/tags/:pk/ ── タグ削除（204）
const deleteTagHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const tagId = Number(c.req.param("id"));
  const res = await deleteTag(c.env, tagId, userId);
  if ("notFound" in res) return apiError(c, 404, "Tag not found");
  return c.body(null, 204);
};

tagRoutes.delete("/api/videos/tags/:id{[0-9]+}", ...tagWriteGuards, deleteTagHandler);
tagRoutes.delete("/api/videos/tags/:id{[0-9]+}/", ...tagWriteGuards, deleteTagHandler);
