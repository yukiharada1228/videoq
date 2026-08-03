import { tagExists } from "../../repositories/tag-repository";
import { reorderVideos } from "../../repositories/group-repository";
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
} from "../../repositories/membership-repository";
import { planAdditions } from "../../shared/membership-plan";
import type { Bindings } from "../../types/bindings";

export async function addTagsToVideo(
  env: Bindings,
  userId: number,
  videoId: number,
  tagIds: number[],
) {
  if (!(await videoOwnedBy(env, videoId, userId))) {
    return { notFound: "Video not found" } as const;
  }

  const attached = await getAttachedTagIds(env, videoId);
  const { idsToAdd, skipped: skippedBefore } = planAdditions(
    tagIds,
    new Set(attached),
  );

  if (idsToAdd.length === 0) {
    return {
      ok: true as const,
      message: "Added 0 tags to video",
      added_count: 0,
      skipped_count: skippedBefore,
    };
  }

  if ((await countOwnedTags(env, idsToAdd, userId)) !== idsToAdd.length) {
    return { notFound: "Resource not found" } as const;
  }

  const { added, skippedInPersist } = await attachTags(env, videoId, idsToAdd);
  return {
    ok: true as const,
    message: `Added ${added} tags to video`,
    added_count: added,
    skipped_count: skippedBefore + skippedInPersist,
  };
}

export async function removeTagFromVideo(
  env: Bindings,
  userId: number,
  videoId: number,
  tagId: number,
) {
  if (!(await videoOwnedBy(env, videoId, userId))) {
    return { notFound: "Video not found" } as const;
  }
  if (!(await tagExists(env, tagId, userId))) {
    return { notFound: "Tag not found" } as const;
  }
  if (!(await videoTagExists(env, videoId, tagId))) {
    return { notFound: "Resource not found" } as const;
  }
  await detachTag(env, videoId, tagId);
  return { ok: true as const, message: "Tag removed from video" };
}

export async function reorderGroupVideos(
  env: Bindings,
  userId: number,
  groupId: number,
  videoIds: number[],
) {
  if (!(await groupOwnedBy(env, groupId, userId))) {
    return { notFound: "Group not found" } as const;
  }

  const memberIds = await getGroupMemberVideoIds(env, groupId);
  const memberSet = new Set(memberIds);
  const mismatch =
    videoIds.length !== memberIds.length ||
    videoIds.some((id) => !memberSet.has(id)) ||
    new Set(videoIds).size !== videoIds.length;
  if (mismatch) {
    return {
      badRequest: "Specified video IDs do not match videos in group",
    } as const;
  }

  await reorderVideos(env, groupId, videoIds);
  return { ok: true as const, message: "Video order updated" };
}

export async function addVideosToGroupBulk(
  env: Bindings,
  userId: number,
  groupId: number,
  videoIds: number[],
) {
  if (!(await groupOwnedBy(env, groupId, userId))) {
    return { notFound: "Group not found" } as const;
  }

  const uniq = [...new Set(videoIds)];
  const existing = await getExistingVideoIdsForUser(env, uniq, userId);
  const missing = uniq.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    return { notFound: "Some videos not found" } as const;
  }

  const memberIds = await getGroupMemberVideoIds(env, groupId);
  const { idsToAdd, skipped } = planAdditions(videoIds, new Set(memberIds));
  const added = await addVideosBulk(env, groupId, idsToAdd);
  return {
    ok: true as const,
    message: `Added ${added} videos to group`,
    added_count: added,
    skipped_count: skipped,
  };
}

export async function addVideoToGroupOne(
  env: Bindings,
  userId: number,
  groupId: number,
  videoId: number,
) {
  if (!(await groupOwnedBy(env, groupId, userId))) {
    return { notFound: "Group not found" } as const;
  }
  if (!(await videoOwnedBy(env, videoId, userId))) {
    return { notFound: "Video not found" } as const;
  }

  const r = await addVideoToGroup(env, groupId, videoId);
  if ("alreadyIn" in r) {
    return { badRequest: "This video is already added to the group" } as const;
  }
  return {
    ok: true as const,
    message: "Video added to group",
    id: r.id,
  };
}

export async function removeVideoFromGroupOne(
  env: Bindings,
  userId: number,
  groupId: number,
  videoId: number,
) {
  if (!(await groupOwnedBy(env, groupId, userId))) {
    return { notFound: "Group not found" } as const;
  }
  if (!(await videoOwnedBy(env, videoId, userId))) {
    return { notFound: "Video not found" } as const;
  }

  const r = await removeVideoFromGroup(env, groupId, videoId);
  if ("notMember" in r) {
    return { notFound: "This video is not added to the group" } as const;
  }
  return { ok: true as const };
}
