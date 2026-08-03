import { Hono } from "hono";
import type { Context } from "hono";
import {
  requireAuth,
  requireScope,
  apiKeyMethod,
  jwtMethod,
} from "../middleware/auth";
import { csrfProtect } from "../middleware/csrf";
import { tagExists } from "../repositories/tag-repository";
import { reorderVideos } from "../repositories/group-repository";
import {
  videoOwnedBy,
  groupOwnedBy,
  getAttachedTagIds,
  countOwnedTags,
  attachTags,
  videoTagExists,
  detachTag,
  addVideoToGroup,
  removeVideoFromGroup,
  getGroupMemberVideoIds,
  getExistingVideoIdsForUser,
  addVideosBulk,
} from "../repositories/membership-repository";
import { apiError } from "../utils/responses";
import { planAdditions } from "../utils/membership-plan";
import type { AppEnv } from "../types/bindings";

/**
 * 移行済みの関連付け系ルート（video↔tag、group↔video）。すべて書き込みのため
 * `requireAuth → csrfProtect(Cookie 時) → requireScope("write")` を適用。
 * 検査順は Django UseCase と一致（group/video 404 → ドメイン例外）。
 *
 *   POST   /api/videos/:vid/tags/                 add_tags_to_video（bulk, skip 集計）
 *   DELETE /api/videos/:vid/tags/:tid/            remove_tag_from_video
 *   POST   /api/videos/groups/:gid/videos/        add_videos_to_group（bulk）
 *   POST   /api/videos/groups/:gid/videos/:vid/   add single video（order=MAX+1）
 *   DELETE /api/videos/groups/:gid/videos/:vid/   remove single video
 */
export const membershipRoutes = new Hono<AppEnv>();

const writeGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  csrfProtect,
  requireScope("write"),
] as const;

async function parseBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => ({}));
  return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
}

// ---- POST /api/videos/:vid/tags/ ── タグを動画へ付与 ----
const addTagsHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const videoId = Number(c.req.param("videoId"));
  const body = await parseBody(c);

  const raw = body.tag_ids;
  if (!Array.isArray(raw) || raw.length === 0)
    return apiError(c, 400, "Tag IDs not specified");

  if (!(await videoOwnedBy(c.env, videoId, userId)))
    return apiError(c, 404, "Video not found");

  // plan_tag_attachment: request の dedupe + 既付与の skip
  const attached = await getAttachedTagIds(c.env, videoId);
  const { idsToAdd, skipped: skippedBefore } = planAdditions(
    raw.map(Number),
    new Set(attached),
  );

  if (idsToAdd.length === 0)
    return c.json(
      { message: "Added 0 tags to video", added_count: 0, skipped_count: skippedBefore },
      201,
    );

  // 全 id が user 所有のタグか（SomeTagsNotFound → "Resource not found"）
  if ((await countOwnedTags(c.env, idsToAdd, userId)) !== idsToAdd.length)
    return apiError(c, 404, "Resource not found");

  const { added, skippedInPersist } = await attachTags(c.env, videoId, idsToAdd);
  return c.json(
    {
      message: `Added ${added} tags to video`,
      added_count: added,
      skipped_count: skippedBefore + skippedInPersist,
    },
    201,
  );
};

membershipRoutes.post("/api/videos/:videoId{[0-9]+}/tags", ...writeGuards, addTagsHandler);
membershipRoutes.post("/api/videos/:videoId{[0-9]+}/tags/", ...writeGuards, addTagsHandler);

// ---- DELETE /api/videos/:vid/tags/:tid/ ── 動画からタグを剥がす ----
const removeTagHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const videoId = Number(c.req.param("videoId"));
  const tagId = Number(c.req.param("tagId"));

  if (!(await videoOwnedBy(c.env, videoId, userId)))
    return apiError(c, 404, "Video not found");
  if (!(await tagExists(c.env, tagId, userId)))
    return apiError(c, 404, "Tag not found");
  // assert_has_tag → TagNotAttachedToVideo → ResourceNotFound("Tag attachment") → 既定文言
  if (!(await videoTagExists(c.env, videoId, tagId)))
    return apiError(c, 404, "Resource not found");

  await detachTag(c.env, videoId, tagId);
  return c.json({ message: "Tag removed from video" });
};

membershipRoutes.delete(
  "/api/videos/:videoId{[0-9]+}/tags/:tagId{[0-9]+}",
  ...writeGuards,
  removeTagHandler,
);
membershipRoutes.delete(
  "/api/videos/:videoId{[0-9]+}/tags/:tagId{[0-9]+}/",
  ...writeGuards,
  removeTagHandler,
);

// ---- PATCH /api/videos/groups/:gid/videos/order/ ── グループ内動画の並び替え ----
// ※ "order" は非数値なので :videoId{[0-9]+} 単体ルートとは競合しない。
const reorderVideosHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));
  const body = await parseBody(c);

  // serializer 未使用: video_ids が配列でなければ 400（空配列は許容）
  const raw = body.video_ids;
  if (!Array.isArray(raw))
    return apiError(c, 400, "video_ids must be an array");

  if (!(await groupOwnedBy(c.env, groupId, userId)))
    return apiError(c, 404, "Group not found");

  // ensure_reorder_matches_members: 件数一致 かつ 集合一致
  const videoIds = raw.map(Number);
  const memberIds = await getGroupMemberVideoIds(c.env, groupId);
  const memberSet = new Set(memberIds);
  const mismatch =
    videoIds.length !== memberIds.length ||
    videoIds.some((id) => !memberSet.has(id)) ||
    new Set(videoIds).size !== videoIds.length;
  if (mismatch)
    return apiError(c, 400, "Specified video IDs do not match videos in group");

  await reorderVideos(c.env, groupId, videoIds);
  return c.json({ message: "Video order updated" });
};

membershipRoutes.patch(
  "/api/videos/groups/:groupId{[0-9]+}/videos/order",
  ...writeGuards,
  reorderVideosHandler,
);
membershipRoutes.patch(
  "/api/videos/groups/:groupId{[0-9]+}/videos/order/",
  ...writeGuards,
  reorderVideosHandler,
);

// ---- POST /api/videos/groups/:gid/videos/ ── 動画を一括追加 ----
const addVideosBulkHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));
  const body = await parseBody(c);

  const raw = body.video_ids;
  if (!Array.isArray(raw) || raw.length === 0)
    return apiError(c, 400, "Video ID not specified");

  if (!(await groupOwnedBy(c.env, groupId, userId)))
    return apiError(c, 404, "Group not found");

  const nums = raw.map(Number);
  const uniq = [...new Set(nums)];
  const existing = await getExistingVideoIdsForUser(c.env, uniq, userId);
  const missing = uniq.filter((id) => !existing.has(id));
  if (missing.length > 0) return apiError(c, 404, "Some videos not found");

  // plan_bulk_add: request 順で dedupe + 既メンバー skip
  const memberIds = await getGroupMemberVideoIds(c.env, groupId);
  const { idsToAdd, skipped } = planAdditions(nums, new Set(memberIds));

  const added = await addVideosBulk(c.env, groupId, idsToAdd);
  return c.json(
    {
      message: `Added ${added} videos to group`,
      added_count: added,
      skipped_count: skipped,
    },
    201,
  );
};

membershipRoutes.post("/api/videos/groups/:groupId{[0-9]+}/videos", ...writeGuards, addVideosBulkHandler);
membershipRoutes.post("/api/videos/groups/:groupId{[0-9]+}/videos/", ...writeGuards, addVideosBulkHandler);

// ---- POST /api/videos/groups/:gid/videos/:vid/ ── 動画 1 件を追加 ----
const addVideoHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));
  const videoId = Number(c.req.param("videoId"));

  if (!(await groupOwnedBy(c.env, groupId, userId)))
    return apiError(c, 404, "Group not found");
  if (!(await videoOwnedBy(c.env, videoId, userId)))
    return apiError(c, 404, "Video not found");

  const r = await addVideoToGroup(c.env, groupId, videoId);
  if ("alreadyIn" in r)
    return apiError(c, 400, "This video is already added to the group");
  return c.json({ message: "Video added to group", id: r.id }, 201);
};

membershipRoutes.post(
  "/api/videos/groups/:groupId{[0-9]+}/videos/:videoId{[0-9]+}",
  ...writeGuards,
  addVideoHandler,
);
membershipRoutes.post(
  "/api/videos/groups/:groupId{[0-9]+}/videos/:videoId{[0-9]+}/",
  ...writeGuards,
  addVideoHandler,
);

// ---- DELETE /api/videos/groups/:gid/videos/:vid/ ── 動画 1 件を除去 ----
const removeVideoHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));
  const videoId = Number(c.req.param("videoId"));

  if (!(await groupOwnedBy(c.env, groupId, userId)))
    return apiError(c, 404, "Group not found");
  if (!(await videoOwnedBy(c.env, videoId, userId)))
    return apiError(c, 404, "Video not found");

  const r = await removeVideoFromGroup(c.env, groupId, videoId);
  if ("notMember" in r)
    return apiError(c, 404, "This video is not added to the group");
  return c.body(null, 204);
};

membershipRoutes.delete(
  "/api/videos/groups/:groupId{[0-9]+}/videos/:videoId{[0-9]+}",
  ...writeGuards,
  removeVideoHandler,
);
membershipRoutes.delete(
  "/api/videos/groups/:groupId{[0-9]+}/videos/:videoId{[0-9]+}/",
  ...writeGuards,
  removeVideoHandler,
);
