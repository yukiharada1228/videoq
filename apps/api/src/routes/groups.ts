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
  listGroupsPage,
  getGroupDetail,
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  getGroupShareSlug,
  setShareSlug,
  getGroupDetailByShareSlug,
} from "../repositories/group-repository";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import { apiError, drfValidationError } from "../utils/responses";
import { charField } from "../utils/drf-fields";
import { validateIntIdList } from "../utils/drf-fields";
import {
  normalizeShareSlug,
  SLUG_ALREADY_EXISTS_MESSAGE,
} from "../lib/share-slug";
import {
  clientIp,
  enforceThrottles,
  throttledResponse,
} from "../lib/rate-limit";
import type { AppEnv } from "../types/bindings";

// VideoGroupCreate/UpdateSerializer 相当の検証（DRF CharField セマンティクス）。
//   create: name CharField(max_length=255), description CharField(required=False, default="", allow_blank=True)
//   update(partial): 双方 required=False
function validateGroupWrite(
  body: Record<string, unknown>,
  partial: boolean,
): { errors: Record<string, string[]> } | { data: { name?: string; description?: string } } {
  const errors: Record<string, string[]> = {};
  const data: { name?: string; description?: string } = {};

  const nameRes = charField(body, "name", { required: !partial, maxLength: 255 });
  if (nameRes.kind === "error") errors.name = [nameRes.message];
  else if (nameRes.kind === "value") data.name = nameRes.value;

  const descRes = charField(body, "description", {
    required: false,
    allowBlank: true,
  });
  if (descRes.kind === "error") errors.description = [descRes.message];
  else if (descRes.kind === "value") data.description = descRes.value;
  else if (!partial) data.description = ""; // create のみ default="" を適用

  return Object.keys(errors).length ? { errors } : { data };
}

async function parseBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => ({}));
  return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
}

/**
 * 移行済みのグループ系ルート（VideoGroupListView と契約互換）。
 *   GET /api/videos/groups/  ── 現在ユーザーのグループ一覧（limit/offset ページネーション）
 *
 * ※ 実 URL は `/api/videos/groups/`（video urls に include されているため）。
 *   認証は AuthenticatedViewMixin と同じ [APIKey, CookieJWT]。読み取りなので scope は no-op。
 */
export const groupRoutes = new Hono<AppEnv>();

const groupAuth = requireAuth(apiKeyMethod, jwtMethod);

const listGroups = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await listGroupsPage(c.env, userId, limit, offset);
  return c.json(limitOffsetPage(c, count, limit, offset, results));
};

groupRoutes.get("/api/videos/groups", groupAuth, listGroups);
groupRoutes.get("/api/videos/groups/", groupAuth, listGroups);

// GET /api/videos/groups/share/:slug/ ── 共有グループ参照（get_shared_group, 認証不要）
// ※ "share" は非数値なので :id{[0-9]+} 詳細ルートとは競合しない。AllowAny。
// ShareTokenIPThrottle（100/hour）: path の share_slug があるときのみ。
const sharedGroupHandler = async (c: Context<AppEnv>) => {
  const slug = c.req.param("slug") ?? "";
  const denied = await enforceThrottles(c.env, [
    { scope: "chat_share_token_ip", ident: slug ? clientIp(c) : null },
  ]);
  if (denied) return throttledResponse(c, denied);

  const group = await getGroupDetailByShareSlug(c.env, slug);
  if (!group) return apiError(c, 404, "Share link not found");
  return c.json(group);
};

groupRoutes.get("/api/videos/groups/share/:slug", sharedGroupHandler);
groupRoutes.get("/api/videos/groups/share/:slug/", sharedGroupHandler);

// グループ詳細（VideoGroupDetailView）。<int:pk> と同じく数値 id のみ。
const groupDetail = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("id"));
  const group = await getGroupDetail(c.env, groupId, userId);
  if (!group) {
    // create_error_response("Group not found", 404)（末尾ピリオド無し）
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Group not found" } },
      404,
    );
  }
  return c.json(group);
};

groupRoutes.get("/api/videos/groups/:id{[0-9]+}", groupAuth, groupDetail);
groupRoutes.get("/api/videos/groups/:id{[0-9]+}/", groupAuth, groupDetail);

// 書き込みガード: 認証 → CSRF（cookie のみ）→ scope（apikey read_only 拒否）。
const groupWriteGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  csrfProtect,
  requireScope("write"),
] as const;

// POST /api/videos/groups/ ── VideoGroupCreateView（201 で詳細を返す）
const createGroupHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const body = await parseBody(c);
  const v = validateGroupWrite(body, false);
  if ("errors" in v) return drfValidationError(c, v.errors);
  const id = await createGroup(c.env, userId, v.data.name!, v.data.description ?? "");
  const group = await getGroupDetail(c.env, id, userId);
  return c.json(group, 201);
};

groupRoutes.post("/api/videos/groups", ...groupWriteGuards, createGroupHandler);
groupRoutes.post("/api/videos/groups/", ...groupWriteGuards, createGroupHandler);

// PATCH /api/videos/groups/:id/ ── VideoGroupDetailView（partial update, 200 で詳細）
const updateGroupHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("id"));
  const body = await parseBody(c);
  const v = validateGroupWrite(body, true);
  if ("errors" in v) return drfValidationError(c, v.errors);
  const res = await updateGroup(c.env, groupId, userId, v.data);
  if ("notFound" in res) return apiError(c, 404, "Group not found");
  const group = await getGroupDetail(c.env, groupId, userId);
  return c.json(group);
};

groupRoutes.patch("/api/videos/groups/:id{[0-9]+}", ...groupWriteGuards, updateGroupHandler);
groupRoutes.patch("/api/videos/groups/:id{[0-9]+}/", ...groupWriteGuards, updateGroupHandler);

// PUT /api/videos/groups/:id/ ── VideoGroupDetailView.put（full update: name 必須, description default ""）
const putGroupHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("id"));
  const body = await parseBody(c);
  const v = validateGroupWrite(body, false); // partial=false → name 必須, description default ""
  if ("errors" in v) return drfValidationError(c, v.errors);
  const res = await updateGroup(c.env, groupId, userId, v.data);
  if ("notFound" in res) return apiError(c, 404, "Group not found");
  return c.json(await getGroupDetail(c.env, groupId, userId));
};

groupRoutes.put("/api/videos/groups/:id{[0-9]+}", ...groupWriteGuards, putGroupHandler);
groupRoutes.put("/api/videos/groups/:id{[0-9]+}/", ...groupWriteGuards, putGroupHandler);

// DELETE /api/videos/groups/:id/ ── cascade 削除して 204
const deleteGroupHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("id"));
  const res = await deleteGroup(c.env, groupId, userId);
  if ("notFound" in res) return apiError(c, 404, "Group not found");
  return c.body(null, 204);
};

groupRoutes.delete("/api/videos/groups/:id{[0-9]+}", ...groupWriteGuards, deleteGroupHandler);
groupRoutes.delete("/api/videos/groups/:id{[0-9]+}/", ...groupWriteGuards, deleteGroupHandler);

// PATCH /api/videos/groups/order/ ── 表示順の並び替え（reorder_video_groups）
// ※ "order" は非数値なので :id{[0-9]+} 更新ルートとは競合しない。
const reorderGroupsHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const body = await parseBody(c);

  const v = validateIntIdList(body, "group_ids");
  if (v.kind === "field") return drfValidationError(c, { group_ids: [v.message] });
  if (v.kind === "flat") return apiError(c, 400, "Bad Request");

  const res = await reorderGroups(c.env, userId, v.ids);
  if ("mismatch" in res)
    return apiError(c, 400, "Specified group IDs do not match user groups");
  return c.json({ message: "Group order updated" });
};

groupRoutes.patch("/api/videos/groups/order", ...groupWriteGuards, reorderGroupsHandler);
groupRoutes.patch("/api/videos/groups/order/", ...groupWriteGuards, reorderGroupsHandler);

// POST /api/videos/groups/:id/share/ ── 共有リンク作成/更新（CreateShareLinkView.post）
const createShareHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("id"));
  const body = await parseBody(c);

  // ShareLinkRequestSerializer: share_slug CharField(trim_whitespace=True)
  const field = charField(body, "share_slug", { required: true });
  if (field.kind !== "value") {
    // required=true のため absent は発生しないが、型の網羅のため両対応
    const message =
      field.kind === "error" ? field.message : "This field is required.";
    return drfValidationError(c, { share_slug: [message] });
  }

  const cur = await getGroupShareSlug(c.env, groupId, userId);
  if (!cur.found) return apiError(c, 404, "Group not found");

  const norm = normalizeShareSlug(field.value);
  if ("error" in norm) return apiError(c, 400, norm.error);

  const res = await setShareSlug(c.env, groupId, userId, norm.slug);
  if ("conflict" in res)
    return apiError(c, 409, SLUG_ALREADY_EXISTS_MESSAGE, "CONFLICT");
  return c.json({ message: "Share link saved", share_slug: norm.slug }, 201);
};

// DELETE /api/videos/groups/:id/share/ ── 共有リンク解除（CreateShareLinkView.delete）
const deleteShareHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("id"));

  const cur = await getGroupShareSlug(c.env, groupId, userId);
  if (!cur.found) return apiError(c, 404, "Group not found");
  if (!cur.slug) return apiError(c, 404, "Share link is not configured");

  await setShareSlug(c.env, groupId, userId, null);
  return c.body(null, 204);
};

groupRoutes.post("/api/videos/groups/:id{[0-9]+}/share", ...groupWriteGuards, createShareHandler);
groupRoutes.post("/api/videos/groups/:id{[0-9]+}/share/", ...groupWriteGuards, createShareHandler);
groupRoutes.delete("/api/videos/groups/:id{[0-9]+}/share", ...groupWriteGuards, deleteShareHandler);
groupRoutes.delete("/api/videos/groups/:id{[0-9]+}/share/", ...groupWriteGuards, deleteShareHandler);
