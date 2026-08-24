import { tagExists } from "../../repositories/tag-repository";
import { reorderVideos } from "../../repositories/course-repository";
import {
  videoOwnedBy,
  courseOwnedBy,
  getAttachedTagIds,
  countOwnedTags,
  attachTags,
  videoTagExists,
  detachTag,
  addVideoToCourse,
  removeVideoFromCourse,
  getCourseMemberVideoIds,
  getExistingVideoIdsForUser,
  addVideosBulk,
} from "../../repositories/membership-repository";
import { planAdditions } from "../../shared/membership-plan";
import type { Bindings } from "../../types/bindings";

export async function addTagsToVideo(
  env: Bindings,
  userId: string,
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
  userId: string,
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
  userId: string,
  courseId: number,
  videoIds: number[],
) {
  if (!(await courseOwnedBy(env, courseId, userId))) {
    return { notFound: "Course not found" } as const;
  }

  const memberIds = await getCourseMemberVideoIds(env, courseId);
  const memberSet = new Set(memberIds);
  const mismatch =
    videoIds.length !== memberIds.length ||
    videoIds.some((id) => !memberSet.has(id)) ||
    new Set(videoIds).size !== videoIds.length;
  if (mismatch) {
    return {
      badRequest: "Specified video IDs do not match videos in course",
    } as const;
  }

  await reorderVideos(env, courseId, videoIds);
  return { ok: true as const, message: "Video order updated" };
}

export async function addVideosToCourseBulk(
  env: Bindings,
  userId: string,
  courseId: number,
  videoIds: number[],
) {
  if (!(await courseOwnedBy(env, courseId, userId))) {
    return { notFound: "Course not found" } as const;
  }

  const uniq = [...new Set(videoIds)];
  const existing = await getExistingVideoIdsForUser(env, uniq, userId);
  const missing = uniq.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    return { notFound: "Some videos not found" } as const;
  }

  const memberIds = await getCourseMemberVideoIds(env, courseId);
  const { idsToAdd, skipped } = planAdditions(videoIds, new Set(memberIds));
  const added = await addVideosBulk(env, courseId, idsToAdd);
  return {
    ok: true as const,
    message: `Added ${added} videos to course`,
    added_count: added,
    skipped_count: skipped,
  };
}

export async function addVideoToCourseOne(
  env: Bindings,
  userId: string,
  courseId: number,
  videoId: number,
) {
  if (!(await courseOwnedBy(env, courseId, userId))) {
    return { notFound: "Course not found" } as const;
  }
  if (!(await videoOwnedBy(env, videoId, userId))) {
    return { notFound: "Video not found" } as const;
  }

  const r = await addVideoToCourse(env, courseId, videoId);
  if ("alreadyIn" in r) {
    return { badRequest: "This video is already added to the course" } as const;
  }
  return {
    ok: true as const,
    message: "Video added to course",
    id: r.id,
  };
}

export async function removeVideoFromCourseOne(
  env: Bindings,
  userId: string,
  courseId: number,
  videoId: number,
) {
  if (!(await courseOwnedBy(env, courseId, userId))) {
    return { notFound: "Course not found" } as const;
  }
  if (!(await videoOwnedBy(env, videoId, userId))) {
    return { notFound: "Video not found" } as const;
  }

  const r = await removeVideoFromCourse(env, courseId, videoId);
  if ("notMember" in r) {
    return { notFound: "This video is not added to the course" } as const;
  }
  return { ok: true as const };
}
